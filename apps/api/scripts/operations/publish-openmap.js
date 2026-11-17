#!/usr/bin/env node

const {
    GetBucketCorsCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutBucketCorsCommand,
    S3Client,
} = require('@aws-sdk/client-s3');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseEnv } = require('node:util');

const REPOSITORY_ROOT = path.resolve(__dirname, '../../../..');
const DEFAULT_RELEASE_DIR = path.join(REPOSITORY_ROOT, 'data/maps/current');
const DEFAULT_STYLE_FILE = path.join(
    REPOSITORY_ROOT,
    'apps/web/public/maps/exchange-style.json',
);
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const CORS_RULE_ID = 'imsweb-openmap-public-read';
const OPENMAP_NAMESPACE = 'openmap';
const EXPECTED_COMPANION_DIRECTORIES = ['fonts', 'natural-earth', 'sprites'];

function usage() {
    return `Usage: node apps/api/scripts/operations/publish-openmap.js [options]

Options:
  --env-file <path>       S3/RustFS environment file (required)
  --expect-bucket <name>  Exact bucket safety assertion (required)
  --release-dir <path>    Prepared map release (default: data/maps/current)
  --style-file <path>     Self-distributed style JSON
  --concurrency <count>   Rclone transfers for small objects (default: 8)
  --rclone-bin <path>     Rclone executable (default: rclone)
  --skip-cors             Do not merge the public read CORS rule
  --apply                 Upload and verify (default is dry-run)
  --help                  Show this help
`;
}

function parseArguments(argv) {
    const options = {
        apply: false,
        concurrency: 8,
        configureCors: true,
        envFile: '',
        expectBucket: '',
        rcloneBin: 'rclone',
        releaseDir: DEFAULT_RELEASE_DIR,
        styleFile: DEFAULT_STYLE_FILE,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--') continue;
        if (argument === '--apply') options.apply = true;
        else if (argument === '--skip-cors') options.configureCors = false;
        else if (argument === '--help') return { ...options, help: true };
        else if (argument === '--env-file') options.envFile = argv[++index];
        else if (argument === '--expect-bucket') {
            options.expectBucket = argv[++index];
        } else if (argument === '--release-dir') {
            options.releaseDir = argv[++index];
        } else if (argument === '--style-file') {
            options.styleFile = argv[++index];
        } else if (argument === '--concurrency') {
            options.concurrency = Number(argv[++index]);
        } else if (argument === '--rclone-bin') {
            options.rcloneBin = argv[++index];
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }
    if (!options.envFile) throw new Error('--env-file is required');
    if (!options.expectBucket) throw new Error('--expect-bucket is required');
    if (
        !Number.isSafeInteger(options.concurrency) ||
        options.concurrency < 1 ||
        options.concurrency > 32
    ) {
        throw new Error('--concurrency must be an integer from 1 to 32');
    }
    return options;
}

function readEnvironment(file) {
    const resolved = path.resolve(REPOSITORY_ROOT, file);
    if (!fs.existsSync(resolved)) {
        throw new Error(`Environment file is missing: ${resolved}`);
    }
    return {
        ...process.env,
        ...parseEnv(fs.readFileSync(resolved, 'utf8')),
    };
}

function requiredValue(environment, name) {
    const value = String(environment[name] || '').trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
}

function booleanValue(value, fallback = false) {
    if (value === undefined || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    throw new Error(`Invalid boolean value: ${value}`);
}

function normalizeBaseUrl(value, name) {
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${name} must be an absolute HTTP(S) URL`);
    }
    if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
    ) {
        throw new Error(`${name} must be a credential-free HTTP(S) URL`);
    }
    return parsed.toString().replace(/\/+$/, '');
}

function isLoopbackEndpoint(value) {
    try {
        const hostname = new URL(value).hostname;
        return ['127.0.0.1', '::1', 'localhost'].includes(hostname);
    } catch {
        return false;
    }
}

function isTestBucket(bucket) {
    return /(^|[._-])test([._-]|$)/i.test(bucket);
}

function targetConfiguration(environment, expectedBucket) {
    const bucket = requiredValue(environment, 'IMS_S3_BUCKET');
    if (bucket !== expectedBucket) {
        throw new Error(
            `Bucket safety assertion failed: expected ${expectedBucket}, received ${bucket}`,
        );
    }
    const endpoint = normalizeBaseUrl(
        requiredValue(environment, 'IMS_S3_ENDPOINT'),
        'IMS_S3_ENDPOINT',
    );
    if (!isLoopbackEndpoint(endpoint) && !isTestBucket(bucket)) {
        throw new Error(
            `Refusing non-loopback bucket without an explicit test segment: ${bucket}`,
        );
    }
    return {
        accessKeyId: requiredValue(environment, 'AWS_ACCESS_KEY_ID'),
        bucket,
        endpoint,
        forcePathStyle: booleanValue(environment.IMS_S3_FORCE_PATH_STYLE),
        publicReadUrlBase: normalizeBaseUrl(
            requiredValue(environment, 'IMS_PUBLIC_READ_URL_BASE'),
            'IMS_PUBLIC_READ_URL_BASE',
        ),
        region: requiredValue(environment, 'IMS_S3_REGION'),
        secretAccessKey: requiredValue(environment, 'AWS_SECRET_ACCESS_KEY'),
        sessionToken: String(environment.AWS_SESSION_TOKEN || '').trim(),
    };
}

function assertSafeSegment(value, name) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
        throw new Error(`${name} is not a safe object-key segment`);
    }
    return value;
}

function releaseVersion(manifest) {
    const snapshot = assertSafeSegment(
        String(manifest.openFreeMapVersion || ''),
        'openFreeMapVersion',
    );
    const maxZoom = Number(manifest.maxZoom);
    if (!Number.isSafeInteger(maxZoom) || maxZoom < 0 || maxZoom > 22) {
        throw new Error('manifest.maxZoom must be an integer from 0 to 22');
    }
    return `${snapshot}-z0-${maxZoom}`;
}

function objectKey(release, relativePath = '') {
    const root = `${OPENMAP_NAMESPACE}/${assertSafeSegment(release, 'release')}`;
    if (!relativePath) return root;
    const normalized = relativePath.replaceAll('\\', '/').replace(/^\/+/, '');
    if (
        !normalized ||
        normalized
            .split('/')
            .some((segment) => !segment || segment === '.' || segment === '..')
    ) {
        throw new Error(
            `Invalid release-relative object path: ${relativePath}`,
        );
    }
    return `${root}/${normalized}`;
}

function walkFiles(root) {
    const files = [];
    const visit = (directory) => {
        for (const entry of fs.readdirSync(directory, {
            withFileTypes: true,
        })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(file);
            else if (entry.isFile()) files.push(file);
        }
    };
    visit(root);
    return files;
}

function readJsonFile(file, label) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(
            `Cannot parse ${label} JSON at ${file}: ${error instanceof Error ? error.message : error}`,
        );
    }
}

function sha256(file) {
    const hash = createHash('sha256');
    const descriptor = fs.openSync(file, 'r');
    const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
    try {
        let bytesRead;
        do {
            bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
            if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
        } while (bytesRead);
    } finally {
        fs.closeSync(descriptor);
    }
    return hash.digest('hex');
}

function buildPublicationPlan(releaseDirValue, styleFileValue) {
    const releaseDir = fs.realpathSync(
        path.resolve(REPOSITORY_ROOT, releaseDirValue),
    );
    const styleFile = fs.realpathSync(
        path.resolve(REPOSITORY_ROOT, styleFileValue),
    );
    const sourceManifestFile = path.join(releaseDir, 'manifest.json');
    const sourceManifest = readJsonFile(sourceManifestFile, 'source manifest');
    const version = releaseVersion(sourceManifest);
    const archiveFile = path.join(releaseDir, sourceManifest.archive.file);
    if (!fs.existsSync(archiveFile))
        throw new Error(`Map archive is missing: ${archiveFile}`);
    if (fs.statSync(archiveFile).size !== sourceManifest.archive.bytes) {
        throw new Error('Map archive byte count does not match manifest');
    }
    for (const directory of EXPECTED_COMPANION_DIRECTORIES) {
        if (!fs.statSync(path.join(releaseDir, directory)).isDirectory()) {
            throw new Error(`Map companion directory is missing: ${directory}`);
        }
    }

    const companionFiles = EXPECTED_COMPANION_DIRECTORIES.flatMap((directory) =>
        walkFiles(path.join(releaseDir, directory)),
    );
    if (companionFiles.length !== sourceManifest.companionAssets.total) {
        throw new Error(
            `Companion object count mismatch: expected ${sourceManifest.companionAssets.total}, received ${companionFiles.length}`,
        );
    }
    const style = readJsonFile(styleFile, 'map style');
    if (style.version !== 8)
        throw new Error('Map style must use specification version 8');

    const assets = [archiveFile, ...companionFiles];
    const assetBytes = assets.reduce(
        (total, file) => total + fs.statSync(file).size,
        0,
    );
    const publicationManifest = {
        schemaVersion: 1,
        namespace: OPENMAP_NAMESPACE,
        releaseVersion: version,
        objectRoot: objectKey(version),
        styleObject: objectKey(version, 'exchange-style.json'),
        assetRoot: objectKey(version, 'exchange'),
        objectCount: 2 + assets.length,
        assetBytes,
        style: {
            bytes: fs.statSync(styleFile).size,
            sha256: sha256(styleFile),
        },
        source: sourceManifest,
    };
    const manifestBody = `${JSON.stringify(publicationManifest, null, 2)}\n`;

    return {
        archiveFile,
        manifestBody: `${JSON.stringify(publicationManifest, null, 2)}\n`,
        objectCount: publicationManifest.objectCount,
        objectRoot: publicationManifest.objectRoot,
        publicRelativeStyle: 'exchange-style.json',
        releaseDir,
        releaseVersion: version,
        sourceManifest,
        styleFile,
        totalBytes:
            publicationManifest.assetBytes +
            publicationManifest.style.bytes +
            Buffer.byteLength(manifestBody),
    };
}

function createS3Client(configuration) {
    return new S3Client({
        region: configuration.region,
        endpoint: configuration.endpoint,
        forcePathStyle: configuration.forcePathStyle,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        credentials: {
            accessKeyId: configuration.accessKeyId,
            secretAccessKey: configuration.secretAccessKey,
            ...(configuration.sessionToken
                ? { sessionToken: configuration.sessionToken }
                : {}),
        },
    });
}

function rcloneEnvironment(configuration) {
    return {
        ...process.env,
        RCLONE_CONFIG_OPENMAP_TYPE: 's3',
        RCLONE_CONFIG_OPENMAP_PROVIDER: configuration.endpoint.includes(
            '.r2.cloudflarestorage.com',
        )
            ? 'Cloudflare'
            : 'Other',
        RCLONE_CONFIG_OPENMAP_ACCESS_KEY_ID: configuration.accessKeyId,
        RCLONE_CONFIG_OPENMAP_SECRET_ACCESS_KEY: configuration.secretAccessKey,
        RCLONE_CONFIG_OPENMAP_ENDPOINT: configuration.endpoint,
        RCLONE_CONFIG_OPENMAP_REGION: configuration.region,
        RCLONE_CONFIG_OPENMAP_FORCE_PATH_STYLE: String(
            configuration.forcePathStyle,
        ),
        ...(configuration.sessionToken
            ? {
                  RCLONE_CONFIG_OPENMAP_SESSION_TOKEN:
                      configuration.sessionToken,
              }
            : {}),
    };
}

function runProcess(command, args, environment) {
    const result = spawnSync(command, args, {
        cwd: REPOSITORY_ROOT,
        env: environment,
        stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`${command} failed with exit code ${result.status}`);
    }
}

function remotePath(configuration, key) {
    return `openmap:${configuration.bucket}/${key}`;
}

function commonRcloneArguments(options) {
    return [
        '--immutable',
        '--s3-no-check-bucket',
        '--s3-chunk-size',
        '256M',
        '--s3-upload-concurrency',
        '4',
        '--transfers',
        String(options.concurrency),
        '--checkers',
        String(Math.min(32, options.concurrency * 2)),
        '--stats',
        '30s',
        '--stats-one-line',
        '--header-upload',
        `Cache-Control: ${CACHE_CONTROL}`,
    ];
}

function uploadFile(options, source, key, contentType) {
    runProcess(
        options.rcloneBin,
        [
            'copyto',
            source,
            remotePath(options.configuration, key),
            ...commonRcloneArguments(options),
            '--header-upload',
            `Content-Type: ${contentType}`,
        ],
        options.rcloneEnvironment,
    );
}

function uploadDirectory(options, source, key, contentType, include) {
    runProcess(
        options.rcloneBin,
        [
            'copy',
            source,
            remotePath(options.configuration, key),
            ...commonRcloneArguments(options),
            '--header-upload',
            `Content-Type: ${contentType}`,
            ...(include ? ['--include', include] : []),
        ],
        options.rcloneEnvironment,
    );
}

function isCloudflareR2Endpoint(endpoint) {
    try {
        return new URL(endpoint).hostname.endsWith('.r2.cloudflarestorage.com');
    } catch {
        return false;
    }
}

async function configureBucketCors(client, configuration) {
    if (isCloudflareR2Endpoint(configuration.endpoint)) {
        throw new Error(
            'Cloudflare R2 CORS is managed through Wrangler or the Cloudflare API. ' +
                'Apply and verify the bucket policy, then re-run with --skip-cors.',
        );
    }
    await mergeCors(client, configuration.bucket);
}

async function mergeCors(client, bucket) {
    let rules = [];
    try {
        const current = await client.send(
            new GetBucketCorsCommand({ Bucket: bucket }),
        );
        rules = current.CORSRules || [];
    } catch (error) {
        const code = error?.name || error?.Code || '';
        if (!/NoSuchCORS|NoSuchCORSConfiguration/i.test(code)) throw error;
    }
    const rule = {
        ID: CORS_RULE_ID,
        AllowedOrigins: ['*'],
        AllowedMethods: ['GET', 'HEAD'],
        AllowedHeaders: ['range', 'if-match'],
        ExposeHeaders: [
            'etag',
            'accept-ranges',
            'content-range',
            'content-length',
        ],
        MaxAgeSeconds: 3000,
    };
    await client.send(
        new PutBucketCorsCommand({
            Bucket: bucket,
            CORSConfiguration: {
                CORSRules: [
                    ...rules.filter((entry) => entry.ID !== CORS_RULE_ID),
                    rule,
                ],
            },
        }),
    );
}

async function remoteInventory(client, bucket, prefix) {
    let continuationToken;
    let count = 0;
    let bytes = 0;
    do {
        const page = await client.send(
            new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: `${prefix}/`,
                ContinuationToken: continuationToken,
            }),
        );
        for (const object of page.Contents || []) {
            count += 1;
            bytes += Number(object.Size || 0);
        }
        continuationToken = page.IsTruncated
            ? page.NextContinuationToken
            : undefined;
    } while (continuationToken);
    return { bytes, count };
}

async function assertHead(client, configuration, key, expected) {
    const result = await client.send(
        new HeadObjectCommand({ Bucket: configuration.bucket, Key: key }),
    );
    if (Number(result.ContentLength) !== expected.bytes) {
        throw new Error(`Remote byte mismatch for ${key}`);
    }
    if (
        !String(result.ContentType || '')
            .toLowerCase()
            .startsWith(expected.contentType)
    ) {
        throw new Error(
            `Remote Content-Type mismatch for ${key}: ${result.ContentType}`,
        );
    }
    if (result.CacheControl !== CACHE_CONTROL) {
        throw new Error(`Remote Cache-Control mismatch for ${key}`);
    }
}

function publicUrl(configuration, key) {
    return `${configuration.publicReadUrlBase}/${key
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`;
}

async function fetchChecked(url, init, expectedStatus) {
    const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(30_000),
    });
    if (response.status !== expectedStatus) {
        throw new Error(
            `Expected HTTP ${expectedStatus} from ${url}, received ${response.status}`,
        );
    }
    return response;
}

async function verifyPublicDelivery(configuration, plan) {
    const originHeaders = { Origin: 'tauri://localhost' };
    const styleKey = objectKey(plan.releaseVersion, 'exchange-style.json');
    const styleResponse = await fetchChecked(
        publicUrl(configuration, styleKey),
        { headers: originHeaders },
        200,
    );
    const allowOrigin = styleResponse.headers.get(
        'access-control-allow-origin',
    );
    if (!['*', 'tauri://localhost'].includes(allowOrigin)) {
        throw new Error(
            `Public CORS does not allow the Tauri origin: ${allowOrigin}`,
        );
    }
    const style = await styleResponse.json();
    if (style.version !== 8) throw new Error('Public style JSON is invalid');

    const archiveKey = objectKey(
        plan.releaseVersion,
        `exchange/${plan.sourceManifest.archive.file}`,
    );
    const rangeResponse = await fetchChecked(
        publicUrl(configuration, archiveKey),
        { headers: { ...originHeaders, Range: 'bytes=0-16383' } },
        206,
    );
    if (Number(rangeResponse.headers.get('content-length')) !== 16_384) {
        throw new Error('Public PMTiles range Content-Length is invalid');
    }
    if (
        rangeResponse.headers.get('content-range') !==
        `bytes 0-16383/${plan.sourceManifest.archive.bytes}`
    ) {
        throw new Error('Public PMTiles Content-Range is invalid');
    }
    await rangeResponse.body?.cancel();
}

async function publish(options) {
    const environment = readEnvironment(options.envFile);
    const configuration = targetConfiguration(
        environment,
        options.expectBucket,
    );
    const plan = buildPublicationPlan(options.releaseDir, options.styleFile);
    const styleUrl = publicUrl(
        configuration,
        objectKey(plan.releaseVersion, plan.publicRelativeStyle),
    );

    console.log(`Bucket: ${configuration.bucket}`);
    console.log(`Endpoint: ${configuration.endpoint}`);
    console.log(`Object root: ${plan.objectRoot}`);
    console.log(`Objects: ${plan.objectCount}`);
    console.log(`Bytes: ${plan.totalBytes}`);
    console.log(`Style URL: ${styleUrl}`);
    if (!options.apply) {
        console.log('Dry-run only. Re-run with --apply to upload.');
        return { configuration, plan, styleUrl };
    }

    const client = createS3Client(configuration);
    const temporaryDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'imsweb-openmap-'),
    );
    const publicationManifestFile = path.join(
        temporaryDirectory,
        'manifest.json',
    );
    fs.writeFileSync(publicationManifestFile, plan.manifestBody);
    const rcloneOptions = {
        ...options,
        configuration,
        rcloneEnvironment: rcloneEnvironment(configuration),
    };
    try {
        if (options.configureCors) {
            await configureBucketCors(client, configuration);
        }
        uploadFile(
            rcloneOptions,
            plan.styleFile,
            objectKey(plan.releaseVersion, 'exchange-style.json'),
            'application/json',
        );
        uploadFile(
            rcloneOptions,
            publicationManifestFile,
            objectKey(plan.releaseVersion, 'manifest.json'),
            'application/json',
        );
        uploadFile(
            rcloneOptions,
            plan.archiveFile,
            objectKey(
                plan.releaseVersion,
                `exchange/${plan.sourceManifest.archive.file}`,
            ),
            'application/vnd.pmtiles',
        );
        uploadDirectory(
            rcloneOptions,
            path.join(plan.releaseDir, 'fonts'),
            objectKey(plan.releaseVersion, 'exchange/fonts'),
            'application/x-protobuf',
        );
        uploadDirectory(
            rcloneOptions,
            path.join(plan.releaseDir, 'natural-earth'),
            objectKey(plan.releaseVersion, 'exchange/natural-earth'),
            'image/png',
        );
        uploadDirectory(
            rcloneOptions,
            path.join(plan.releaseDir, 'sprites'),
            objectKey(plan.releaseVersion, 'exchange/sprites'),
            'application/json',
            '*.json',
        );
        uploadDirectory(
            rcloneOptions,
            path.join(plan.releaseDir, 'sprites'),
            objectKey(plan.releaseVersion, 'exchange/sprites'),
            'image/png',
            '*.png',
        );

        const inventory = await remoteInventory(
            client,
            configuration.bucket,
            plan.objectRoot,
        );
        if (inventory.count !== plan.objectCount) {
            throw new Error(
                `Remote object count mismatch: expected ${plan.objectCount}, received ${inventory.count}`,
            );
        }
        if (inventory.bytes !== plan.totalBytes) {
            throw new Error(
                `Remote byte total mismatch: expected ${plan.totalBytes}, received ${inventory.bytes}`,
            );
        }
        await assertHead(
            client,
            configuration,
            objectKey(plan.releaseVersion, 'exchange-style.json'),
            {
                bytes: fs.statSync(plan.styleFile).size,
                contentType: 'application/json',
            },
        );
        await assertHead(
            client,
            configuration,
            objectKey(
                plan.releaseVersion,
                `exchange/${plan.sourceManifest.archive.file}`,
            ),
            {
                bytes: plan.sourceManifest.archive.bytes,
                contentType: 'application/vnd.pmtiles',
            },
        );
        await verifyPublicDelivery(configuration, plan);
        console.log(`Published and verified: ${styleUrl}`);
        return { configuration, inventory, plan, styleUrl };
    } finally {
        client.destroy();
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        console.log(usage());
        return;
    }
    await publish(options);
}

module.exports = {
    OPENMAP_NAMESPACE,
    buildPublicationPlan,
    objectKey,
    parseArguments,
    publish,
    releaseVersion,
    targetConfiguration,
};

if (require.main === module) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
