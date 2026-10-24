#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseEnv } = require('node:util');
const {
    GetObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    DeleteObjectsCommand,
    S3Client
} = require('@aws-sdk/client-s3');

const API_ROOT = path.resolve(__dirname, '../..');
const REPOSITORY_ROOT = path.resolve(API_ROOT, '../..');
const COMPOSE_FILE = path.join(REPOSITORY_ROOT, 'deploy/compose.yaml');
const DEFAULT_SOURCE_ENV = path.join(REPOSITORY_ROOT, 'deploy/.env.r2-test');
const DEPLOY_ENV = path.join(REPOSITORY_ROOT, 'deploy/.env');
const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;

function usage() {
    return `Usage:
  pnpm run dev:rustfs:sync-r2
  pnpm run dev:rustfs:sync-r2 -- --apply

Options:
  --source-env <path>  Ignored env file for the R2 test bucket.
                       Default: deploy/.env.r2-test
  --apply              Start RustFS and copy the source bucket.
  --prune-target       Delete RustFS objects that do not exist in R2.
                       Requires --apply.
  --help               Show this help.

Without --apply, the command performs a read-only source and target inventory.
The source must be a Cloudflare R2 bucket whose name has a distinct test segment.
An exact sync refuses target-only objects unless --apply --prune-target is
provided explicitly.`;
}

function parseArguments(argv) {
    const values = argv.filter(value => value !== '--');
    const options = {
        apply: false,
        help: false,
        pruneTarget: false,
        sourceEnv: DEFAULT_SOURCE_ENV
    };
    while (values.length > 0) {
        const argument = values.shift();
        if (argument === '--help' || argument === '-h') {
            options.help = true;
            continue;
        }
        if (argument === '--apply') {
            options.apply = true;
            continue;
        }
        if (argument === '--prune-target') {
            options.pruneTarget = true;
            continue;
        }
        if (argument === '--source-env') {
            const value = values.shift();
            if (!value) throw new Error('--source-env requires a path');
            options.sourceEnv = path.resolve(REPOSITORY_ROOT, value);
            continue;
        }
        throw new Error(`Unknown argument: ${argument}`);
    }
    if (options.pruneTarget && !options.apply) {
        throw new Error('--prune-target requires --apply');
    }
    return options;
}

function readEnvironment(file, required = false) {
    if (!fs.existsSync(file)) {
        if (required) throw new Error(`Environment file is missing: ${file}`);
        return {};
    }
    try {
        return parseEnv(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`Cannot parse ${file}: ${error.message}`);
    }
}

function requiredValue(environment, name) {
    const value = String(environment[name] || '').trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
}

function booleanValue(value) {
    return ['1', 'true', 'yes', 'on'].includes(
        String(value || '').trim().toLowerCase()
    );
}

function validateSourceEnvironment(environment) {
    if (requiredValue(environment, 'IMS_OBJECT_STORAGE').toLowerCase() !== 's3') {
        throw new Error('R2 source requires IMS_OBJECT_STORAGE=s3');
    }
    const bucket = requiredValue(environment, 'IMS_S3_BUCKET');
    if (!/(?:^|[._-])test(?:$|[._-])/.test(bucket.toLowerCase())) {
        throw new Error('R2 source bucket must have a distinct test segment');
    }
    let endpoint;
    try {
        endpoint = new URL(requiredValue(environment, 'IMS_S3_ENDPOINT'));
    } catch {
        throw new Error('R2 source endpoint must be a valid URL');
    }
    if (
        endpoint.protocol !== 'https:' ||
        !endpoint.hostname.endsWith('.r2.cloudflarestorage.com') ||
        (endpoint.pathname !== '/' && endpoint.pathname !== '') ||
        endpoint.username || endpoint.password || endpoint.search || endpoint.hash
    ) {
        throw new Error('R2 source endpoint must be a credential-free Cloudflare S3 API URL');
    }
    if (requiredValue(environment, 'IMS_S3_REGION') !== 'auto') {
        throw new Error('R2 source requires IMS_S3_REGION=auto');
    }
    if (booleanValue(environment.IMS_S3_FORCE_PATH_STYLE)) {
        throw new Error('R2 source requires IMS_S3_FORCE_PATH_STYLE=false');
    }
    return {
        bucket,
        endpoint: endpoint.toString().replace(/\/+$/, ''),
        region: 'auto',
        accessKeyId: requiredValue(environment, 'AWS_ACCESS_KEY_ID'),
        secretAccessKey: requiredValue(environment, 'AWS_SECRET_ACCESS_KEY'),
        sessionToken: String(environment.AWS_SESSION_TOKEN || '').trim()
    };
}

function resolveTargetEnvironment(environment) {
    const port = Number(environment.IMS_RUSTFS_API_PORT || 9000);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error('IMS_RUSTFS_API_PORT must be an integer between 1 and 65535');
    }
    const bucket = String(
        environment.IMS_RUSTFS_BUCKET || 'imsweb-media-local'
    ).trim();
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
        throw new Error('IMS_RUSTFS_BUCKET is invalid');
    }
    return {
        bucket,
        endpoint: `http://127.0.0.1:${port}`,
        region: 'us-east-1',
        accessKeyId: String(
            environment.IMS_RUSTFS_ACCESS_KEY || 'imsweb-local'
        ),
        secretAccessKey: String(
            environment.IMS_RUSTFS_SECRET_KEY || 'imsweb-local-password'
        )
    };
}

function createClient(configuration, forcePathStyle) {
    return new S3Client({
        region: configuration.region,
        endpoint: configuration.endpoint,
        forcePathStyle,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        credentials: {
            accessKeyId: configuration.accessKeyId,
            secretAccessKey: configuration.secretAccessKey,
            ...(configuration.sessionToken
                ? { sessionToken: configuration.sessionToken }
                : {})
        }
    });
}

async function inventoryBucket(client, bucket) {
    const objects = new Map();
    let continuationToken;
    do {
        const page = await client.send(new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: continuationToken
        }));
        for (const object of page.Contents || []) {
            if (typeof object.Key !== 'string') {
                throw new Error('S3 inventory returned an object without a key');
            }
            objects.set(object.Key, Number(object.Size || 0));
        }
        continuationToken = page.IsTruncated
            ? page.NextContinuationToken
            : undefined;
        if (page.IsTruncated && !continuationToken) {
            throw new Error('S3 inventory pagination token is missing');
        }
    } while (continuationToken);
    return objects;
}

function summarizeInventory(inventory) {
    let bytes = 0;
    for (const size of inventory.values()) bytes += size;
    return { objects: inventory.size, bytes };
}

function compareInventories(source, target) {
    const missing = [];
    const mismatched = [];
    const extra = [];
    for (const [key, sourceSize] of source) {
        if (!target.has(key)) {
            missing.push(key);
        } else if (target.get(key) !== sourceSize) {
            mismatched.push(key);
        }
    }
    for (const key of target.keys()) {
        if (!source.has(key)) extra.push(key);
    }
    return { missing, mismatched, extra };
}

function inventoriesEqual(left, right) {
    const differences = compareInventories(left, right);
    return Object.values(differences).every(entries => entries.length === 0);
}

function formatBytes(bytes) {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function printInventory(label, inventory) {
    const summary = summarizeInventory(inventory);
    console.log(
        `${label}: ${summary.objects} objects, ${summary.bytes} bytes ` +
        `(${formatBytes(summary.bytes)})`
    );
}

function composeArguments(deployEnvironmentPresent, args) {
    const result = ['compose'];
    if (deployEnvironmentPresent) result.push('--env-file', DEPLOY_ENV);
    result.push('--profile', 'local-storage', '-f', COMPOSE_FILE, ...args);
    return result;
}

function runProcess(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: REPOSITORY_ROOT,
        env: { ...process.env, ...options.env },
        encoding: 'utf8',
        maxBuffer: MAX_CAPTURE_BYTES,
        stdio: options.stdio || 'inherit'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(
            `${options.label || command} failed with exit code ${result.status}`
        );
    }
}

function startRustfs(deployEnvironmentPresent) {
    runProcess('docker', composeArguments(deployEnvironmentPresent, [
        'up', '-d', 'rustfs', 'rustfs-init'
    ]), { label: 'starting RustFS' });
}

async function copyObject({
    sourceClient,
    sourceBucket,
    targetClient,
    targetBucket,
    key,
    expectedBytes
}) {
    const source = await sourceClient.send(new GetObjectCommand({
        Bucket: sourceBucket,
        Key: key
    }));
    if (Number(source.ContentLength) !== expectedBytes) {
        source.Body?.destroy?.();
        throw new Error(`R2 object size changed during sync: ${key}`);
    }
    if (!source.Body) throw new Error(`R2 object body is missing: ${key}`);

    try {
        await targetClient.send(new PutObjectCommand({
            Bucket: targetBucket,
            Key: key,
            Body: source.Body,
            ContentLength: expectedBytes,
            CacheControl: source.CacheControl,
            ContentDisposition: source.ContentDisposition,
            ContentEncoding: source.ContentEncoding,
            ContentLanguage: source.ContentLanguage,
            ContentType: source.ContentType,
            Expires: source.Expires,
            Metadata: source.Metadata,
            WebsiteRedirectLocation: source.WebsiteRedirectLocation
        }));
    } catch (error) {
        source.Body.destroy?.();
        throw error;
    }
}

async function deleteTargetOnlyObjects(targetClient, targetBucket, keys) {
    for (let index = 0; index < keys.length; index += 1000) {
        const batch = keys.slice(index, index + 1000);
        const result = await targetClient.send(new DeleteObjectsCommand({
            Bucket: targetBucket,
            Delete: {
                Objects: batch.map(Key => ({ Key })),
                Quiet: true
            }
        }));
        if (result.Errors?.length) {
            const failures = result.Errors.slice(0, 10).map(error =>
                `${error.Key || 'unknown'}: ${error.Code || error.Message || 'delete failed'}`
            );
            throw new Error(`RustFS target pruning failed: ${failures.join(', ')}`);
        }
    }
}

async function copyObjects(options) {
    const concurrency = Number(process.env.IMS_RUSTFS_SYNC_CONCURRENCY || 32);
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) {
        throw new Error('IMS_RUSTFS_SYNC_CONCURRENCY must be between 1 and 64');
    }
    let cursor = 0;
    let completed = 0;
    let transferredBytes = 0;
    let nextProgressBytes = 128 * 1024 * 1024;
    const startedAt = Date.now();

    async function worker() {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= options.entries.length) return;
            const [key, expectedBytes] = options.entries[index];
            await copyObject({ ...options, key, expectedBytes });
            completed += 1;
            transferredBytes += expectedBytes;
            if (
                completed === options.entries.length ||
                completed % 250 === 0 ||
                transferredBytes >= nextProgressBytes
            ) {
                while (transferredBytes >= nextProgressBytes) {
                    nextProgressBytes += 128 * 1024 * 1024;
                }
                const seconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
                console.log(
                    `Copied ${completed}/${options.entries.length} objects, ` +
                    `${formatBytes(transferredBytes)} at ` +
                    `${formatBytes(transferredBytes / seconds)}/s.`
                );
            }
        }
    }

    await Promise.all(
        Array.from(
            { length: Math.min(concurrency, options.entries.length) },
            () => worker()
        )
    );
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        console.log(usage());
        return;
    }

    const source = validateSourceEnvironment(
        readEnvironment(options.sourceEnv, true)
    );
    const deployEnvironmentPresent = fs.existsSync(DEPLOY_ENV);
    const targetEnvironment = {
        ...readEnvironment(DEPLOY_ENV),
        ...process.env
    };
    const target = resolveTargetEnvironment(targetEnvironment);

    if (options.apply) startRustfs(deployEnvironmentPresent);

    const sourceClient = createClient(source, false);
    const targetClient = createClient(target, true);
    const sourceBefore = await inventoryBucket(sourceClient, source.bucket);
    let targetBefore;
    try {
        targetBefore = await inventoryBucket(targetClient, target.bucket);
    } catch (error) {
        if (!options.apply) {
            throw new Error(
                `RustFS target is unavailable; start it with pnpm run ` +
                `dev:rustfs:up (${error.name}: ${error.message})`
            );
        }
        throw error;
    }

    printInventory('R2 test source', sourceBefore);
    printInventory('RustFS target before sync', targetBefore);
    const beforeDifferences = compareInventories(sourceBefore, targetBefore);
    console.log(
        `Plan: ${beforeDifferences.missing.length} missing, ` +
        `${beforeDifferences.mismatched.length} size-mismatched, ` +
        `${beforeDifferences.extra.length} target-only objects.`
    );

    if (beforeDifferences.extra.length > 0 && !options.pruneTarget) {
        throw new Error(
            'RustFS contains target-only objects; re-run with --apply --prune-target ' +
            'to make the target match R2 exactly'
        );
    }
    if (!options.apply) {
        console.log('Dry run complete. Re-run with --apply to copy data.');
        return;
    }

    const keysToCopy = [
        ...beforeDifferences.missing,
        ...beforeDifferences.mismatched
    ].sort().map(key => [key, sourceBefore.get(key)]);
    await copyObjects({
        sourceClient,
        sourceBucket: source.bucket,
        targetClient,
        targetBucket: target.bucket,
        entries: keysToCopy
    });
    if (beforeDifferences.extra.length > 0) {
        await deleteTargetOnlyObjects(
            targetClient,
            target.bucket,
            beforeDifferences.extra.sort()
        );
    }
    const [sourceAfter, targetAfter] = await Promise.all([
        inventoryBucket(sourceClient, source.bucket),
        inventoryBucket(targetClient, target.bucket)
    ]);
    if (!inventoriesEqual(sourceBefore, sourceAfter)) {
        throw new Error('R2 source inventory changed during sync; retry');
    }
    const differences = compareInventories(sourceAfter, targetAfter);
    if (!Object.values(differences).every(entries => entries.length === 0)) {
        throw new Error(
            `RustFS verification failed: ${differences.missing.length} missing, ` +
            `${differences.mismatched.length} size-mismatched, ` +
            `${differences.extra.length} extra objects`
        );
    }
    printInventory('RustFS target after sync', targetAfter);
    console.log('RustFS sync verified: object keys and byte sizes exactly match R2.');
}

module.exports = {
    compareInventories,
    deleteTargetOnlyObjects,
    parseArguments,
    resolveTargetEnvironment,
    summarizeInventory,
    validateSourceEnvironment
};

if (require.main === module) {
    main().catch(error => {
        console.error(`RustFS sync failed: ${error.message}`);
        process.exitCode = 1;
    });
}
