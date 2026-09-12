"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { S3Client } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const sharp = require("sharp");

const DEFAULT_SOURCE = "https://idol-master.top";
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_FONT_BYTES = 2 * 1024 * 1024;

function digest(body) {
    return crypto.createHash("sha256").update(body).digest("hex");
}

function normalizedBaseUrl(value) {
    let parsed;
    try {
        parsed = new URL(value);
    } catch (error) {
        throw new Error(`--source-base-url is not a valid URL: ${value}`, {
            cause: error,
        });
    }
    if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
    ) {
        throw new Error(
            "--source-base-url must be an HTTP(S) URL without credentials",
        );
    }
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString().replace(/\/$/, "");
}

function parseArguments(argv, environment = process.env) {
    const projectRoot = path.resolve(__dirname, "../../../..");
    const defaultStaging = path.join(
        projectRoot,
        "data/migration/legacy-brand-assets",
    );
    const options = {
        sourceBaseUrl: normalizedBaseUrl(
            environment.IMS_LEGACY_BRAND_ASSET_BASE_URL || DEFAULT_SOURCE,
        ),
        staging: path.resolve(defaultStaging),
        manifest: path.resolve(defaultStaging, "manifest.json"),
        apply: false,
        confirmSource: "",
        confirmBucket: "",
        requireR2: false,
        expectedBucket: "",
        expectEmptyPrefix: false,
        help: false,
    };
    let manifestExplicit = false;
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === "--") continue;
        const next = () => {
            const value = argv[++index];
            if (!value || value.startsWith("--"))
                throw new Error(`${argument} requires a value`);
            return value;
        };
        if (argument === "--source-base-url")
            options.sourceBaseUrl = normalizedBaseUrl(next());
        else if (argument === "--staging-dir")
            options.staging = path.resolve(next());
        else if (argument === "--manifest") {
            options.manifest = path.resolve(next());
            manifestExplicit = true;
        } else if (argument === "--apply") options.apply = true;
        else if (argument === "--confirm-source")
            options.confirmSource = normalizedBaseUrl(next());
        else if (argument === "--confirm-bucket")
            options.confirmBucket = next();
        else if (argument === "--require-r2") options.requireR2 = true;
        else if (argument === "--expect-bucket")
            options.expectedBucket = next();
        else if (argument === "--expect-empty-prefix")
            options.expectEmptyPrefix = true;
        else if (argument === "--help" || argument === "-h")
            options.help = true;
        else throw new Error(`Unknown argument: ${argument}`);
    }
    if (!manifestExplicit)
        options.manifest = path.join(options.staging, "manifest.json");
    if (options.requireR2 && options.apply) {
        throw new Error(
            "--require-r2 is read-only and cannot be combined with --apply",
        );
    }
    if (options.requireR2 && !options.expectedBucket) {
        throw new Error("--require-r2 requires --expect-bucket");
    }
    return options;
}

function helpText() {
    return [
        "Usage: pnpm run media:brand-assets:sync -- [options]",
        "",
        "Stages the six series character illustrations and IrisIdol font from the",
        "public legacy site, then compares them with canonical object storage.",
        "Object storage is read-only unless --apply is provided.",
        "",
        "Options:",
        `  --source-base-url <url>  Legacy origin (default: ${DEFAULT_SOURCE})`,
        "  --staging-dir <path>     Ignored media staging directory",
        "  --manifest <path>        JSON audit manifest",
        "  --apply                  Upload missing or changed objects",
        "  --confirm-source <url>   Required exact source confirmation with --apply",
        "  --confirm-bucket <name>  Required exact IMS_S3_BUCKET confirmation with --apply",
        "  --require-r2             Require a read-only Cloudflare R2 acceptance run",
        "  --expect-bucket <name>   Exact bucket required by --require-r2",
        "  --expect-empty-prefix    Require an empty prefix with --require-r2",
        "  --help                   Show this help",
    ].join("\n");
}

function validateR2Target(config, expectedBucket, expectEmptyPrefix) {
    if (config.type !== "s3")
        throw new Error("Brand asset acceptance requires S3 storage");
    if (config.bucket !== expectedBucket) {
        throw new Error(
            `R2 acceptance requires IMS_S3_BUCKET=${expectedBucket}`,
        );
    }
    if (config.region !== "auto")
        throw new Error("R2 acceptance requires IMS_S3_REGION=auto");
    let endpoint;
    try {
        endpoint = config.endpoint ? new URL(config.endpoint) : null;
    } catch {
        endpoint = null;
    }
    if (!endpoint?.hostname.endsWith(".r2.cloudflarestorage.com")) {
        throw new Error("R2 acceptance requires a Cloudflare R2 S3 endpoint");
    }
    if (config.forcePathStyle)
        throw new Error("R2 acceptance requires path-style addressing off");
    if (expectEmptyPrefix && config.prefix) {
        throw new Error("R2 acceptance requires an empty IMS_S3_PREFIX");
    }
    if (!config.publicReadUrlBase) {
        throw new Error("R2 acceptance requires IMS_PUBLIC_READ_URL_BASE");
    }
}

function validateR2Acceptance(result) {
    if (result.some((asset) => asset.objectStatus !== "unchanged")) {
        throw new Error(
            "R2 brand asset acceptance failed because source and objects differ",
        );
    }
    if (
        result.some((asset) => !asset.publicUrl || asset.publicStatus !== 200)
    ) {
        throw new Error(
            "R2 brand asset acceptance failed public URL verification",
        );
    }
}

async function fetchWithRetry(url, label, method = "GET") {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const response = await fetch(url, {
                method,
                headers: {
                    "User-Agent": "IMSWeb brand asset migration/1.0",
                    ...(method === "HEAD"
                        ? { "Accept-Encoding": "identity" }
                        : {}),
                },
                redirect: "follow",
                signal: AbortSignal.timeout(20_000),
            });
            if (response.ok) return response;
            lastError = new Error(`${label} returned HTTP ${response.status}`);
            if (response.status < 500 && response.status !== 429) break;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error(`${label} request failed`);
}

function validateTrueType(body) {
    if (body.byteLength < 28 || body.byteLength > MAX_FONT_BYTES) {
        throw new Error("IrisIdol font has an invalid byte size");
    }
    const signature = body.readUInt32BE(0);
    const allowedSignatures = new Set([
        0x00010000, 0x4f54544f, 0x74727565, 0x74797031,
    ]);
    if (!allowedSignatures.has(signature))
        throw new Error("IrisIdol is not an SFNT font");
    const tableCount = body.readUInt16BE(4);
    if (
        !tableCount ||
        tableCount > 128 ||
        12 + tableCount * 16 > body.byteLength
    ) {
        throw new Error("IrisIdol has an invalid SFNT table directory");
    }
    const tags = new Set();
    for (let index = 0; index < tableCount; index += 1) {
        const offset = 12 + index * 16;
        const tag = body.toString("ascii", offset, offset + 4);
        const tableOffset = body.readUInt32BE(offset + 8);
        const tableLength = body.readUInt32BE(offset + 12);
        if (tableOffset + tableLength > body.byteLength) {
            throw new Error(`IrisIdol contains an invalid ${tag} table`);
        }
        tags.add(tag);
    }
    for (const requiredTag of ["head", "maxp", "name"]) {
        if (!tags.has(requiredTag))
            throw new Error(`IrisIdol is missing the ${requiredTag} table`);
    }
    return { tableCount };
}

async function assetDetails(definition, body) {
    if (definition.kind === "font") return validateTrueType(body);
    if (!body.byteLength || body.byteLength > MAX_IMAGE_BYTES) {
        throw new Error(`${definition.sourcePath} has an invalid byte size`);
    }
    let metadata;
    try {
        metadata = await sharp(body, {
            animated: false,
            failOn: "error",
            limitInputPixels: 150 * 1000 * 1000,
        }).metadata();
    } catch {
        throw new Error(`${definition.sourcePath} is not a decodable image`);
    }
    if (metadata.format !== "png" || !metadata.width || !metadata.height) {
        throw new Error(
            `${definition.sourcePath} must be a PNG with dimensions`,
        );
    }
    return { width: metadata.width, height: metadata.height };
}

async function stageAssets(definitions, sourceBaseUrl, staging) {
    const assetDirectory = path.join(staging, "assets");
    await fs.mkdir(assetDirectory, { recursive: true });
    return Promise.all(
        definitions.map(async (definition, index) => {
            const sourceUrl = new URL(definition.sourcePath, sourceBaseUrl);
            const response = await fetchWithRetry(
                sourceUrl,
                definition.sourcePath,
            );
            const body = Buffer.from(await response.arrayBuffer());
            const details = await assetDetails(definition, body);
            const contentType = response.headers
                .get("content-type")
                ?.split(";")[0]
                .trim();
            if (contentType !== definition.contentType) {
                throw new Error(
                    `${definition.sourcePath} returned ${contentType || "no content type"} instead of ` +
                        definition.contentType,
                );
            }
            const filename = path.posix.basename(definition.sourcePath);
            const stagingPath = path.join(assetDirectory, filename);
            const current = await fs.readFile(stagingPath).catch((error) => {
                if (error.code === "ENOENT") return null;
                throw error;
            });
            if (!current || digest(current) !== digest(body)) {
                const temporary = `${stagingPath}.tmp-${process.pid}-${index}`;
                await fs.writeFile(temporary, body, { mode: 0o600 });
                await fs.rename(temporary, stagingPath);
            }
            return {
                ...definition,
                ...details,
                sourceUrl: sourceUrl.toString(),
                sourceEtag: response.headers.get("etag"),
                sourceLastModified: response.headers.get("last-modified"),
                stagingPath,
                bytes: body.byteLength,
                sha256: digest(body),
                body,
            };
        }),
    );
}

async function publicVerification(storage, entry) {
    const publicUrl =
        (await storage.createPublicReadUrl?.(entry.objectKey)) ?? null;
    if (!publicUrl) return { publicUrl, publicStatus: null };
    const response = await fetchWithRetry(publicUrl, entry.objectKey, "HEAD");
    const contentType = response.headers
        .get("content-type")
        ?.split(";")[0]
        .trim();
    const contentLength = Number(response.headers.get("content-length"));
    if (contentType !== entry.contentType || contentLength !== entry.bytes) {
        throw new Error(
            `Public R2 metadata verification failed: ${entry.objectKey}`,
        );
    }
    return { publicUrl, publicStatus: response.status };
}

async function syncObjects(
    storage,
    assets,
    apply,
    verifyPublic = publicVerification,
) {
    const results = [];
    for (const asset of assets) {
        const existing = await storage.get(asset.objectKey);
        const matches =
            existing !== null &&
            existing.size === asset.bytes &&
            digest(existing.body) === asset.sha256;
        let objectStatus = "unchanged";
        if (!matches && !apply)
            objectStatus = existing ? "would-replace" : "would-upload";
        else if (!matches) {
            objectStatus = existing ? "replaced" : "uploaded";
            await storage.put(asset.objectKey, asset.body, {
                contentType: asset.contentType,
                sha256: asset.sha256,
                metadata: {
                    source: "legacy-brand-asset-import",
                    publicPath: asset.publicPath,
                },
            });
        }
        let publicResult = { publicUrl: null, publicStatus: null };
        if (apply || matches) {
            const verified = await storage.get(asset.objectKey);
            if (
                !verified ||
                verified.size !== asset.bytes ||
                digest(verified.body) !== asset.sha256
            ) {
                throw new Error(
                    `Brand asset object verification failed: ${asset.objectKey}`,
                );
            }
            publicResult = await verifyPublic(storage, asset);
        }
        results.push({ ...asset, ...publicResult, objectStatus });
    }
    return results;
}

async function writeManifest(target, report) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}`;
    await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, {
        mode: 0o600,
    });
    await fs.rename(temporary, target);
}

function countBy(values, field) {
    const result = {};
    for (const value of values)
        result[value[field]] = (result[value[field]] || 0) + 1;
    return result;
}

async function createMigrationStorage(storageConfig) {
    const { parseNodeDatabaseConfig } = require("../../src/config/database.ts");
    const {
        PostgresConnection,
    } = require("../../src/infra/db/postgresql/connection.ts");
    const {
        S3CompensationService,
    } = require("../../src/infra/oss/s3/compensation-service.ts");
    const {
        S3ObjectStorage,
    } = require("../../src/infra/oss/s3/object-storage.ts");
    const {
        S3UploadStateMachine,
    } = require("../../src/infra/oss/s3/upload-state-machine.ts");
    const databaseConfig = parseNodeDatabaseConfig(process.env);
    const database = PostgresConnection.create(databaseConfig);
    const client = new S3Client({
        region: storageConfig.region,
        endpoint: storageConfig.endpoint,
        forcePathStyle: storageConfig.forcePathStyle,
    });
    const state = new S3UploadStateMachine(database);
    try {
        await state.initialize();
    } catch (error) {
        client.destroy();
        await database.close();
        throw error;
    }
    let storage;
    const compensation = new S3CompensationService(
        database,
        state,
        (objectId, physicalKey, storageScope) =>
            storage.deletePhysicalObject(objectId, physicalKey, storageScope),
    );
    storage = new S3ObjectStorage(
        client,
        {
            bucket: storageConfig.bucket,
            publicReadUrlBase: storageConfig.publicReadUrlBase,
            prefix: storageConfig.prefix,
            readUrlTtlSeconds: storageConfig.readUrlTtlSeconds,
        },
        (command, expiresIn) => getSignedUrl(client, command, { expiresIn }),
        state,
        compensation,
    );
    return {
        storage,
        async close() {
            storage.close();
            await database.close();
        },
    };
}

async function main() {
    require("../../src/config/load-environment.ts");
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(`${helpText()}\n`);
        return;
    }
    const bucket = process.env.IMS_S3_BUCKET?.trim() || "";
    if (options.apply && options.confirmSource !== options.sourceBaseUrl) {
        throw new Error(
            `Apply requires --confirm-source ${options.sourceBaseUrl}`,
        );
    }
    if (options.apply && (!bucket || options.confirmBucket !== bucket)) {
        throw new Error(
            `Apply requires --confirm-bucket ${bucket || "<IMS_S3_BUCKET>"}`,
        );
    }
    const {
        parseNodeObjectStorageConfig,
    } = require("../../src/config/object-storage.ts");
    const storageConfig = parseNodeObjectStorageConfig();
    if (storageConfig.type !== "s3") {
        throw new Error(
            "Legacy brand asset migration requires IMS_OBJECT_STORAGE=s3",
        );
    }
    if (options.requireR2) {
        validateR2Target(
            storageConfig,
            options.expectedBucket,
            options.expectEmptyPrefix,
        );
    }
    const {
        BRAND_ASSET_DEFINITIONS,
    } = require("../../src/domains/content/brand-assets/data.ts");
    const assets = await stageAssets(
        BRAND_ASSET_DEFINITIONS,
        options.sourceBaseUrl,
        options.staging,
    );
    let migrationStorage;
    try {
        migrationStorage = await createMigrationStorage(storageConfig);
        const result = await syncObjects(
            migrationStorage.storage,
            assets,
            options.apply,
        );
        if (options.requireR2) validateR2Acceptance(result);
        const report = {
            generatedAt: new Date().toISOString(),
            sourceBaseUrl: options.sourceBaseUrl,
            targetBucket: bucket,
            targetPrefix: process.env.IMS_S3_PREFIX || "",
            apply: options.apply,
            r2Acceptance: options.requireR2,
            summary: {
                assetCount: result.length,
                imageCount: result.filter((asset) => asset.kind === "image")
                    .length,
                fontCount: result.filter((asset) => asset.kind === "font")
                    .length,
                totalBytes: result.reduce(
                    (total, asset) => total + asset.bytes,
                    0,
                ),
                objects: countBy(result, "objectStatus"),
            },
            assets: result.map(({ body, ...asset }) => asset),
        };
        await writeManifest(options.manifest, report);
        process.stdout.write(
            `${JSON.stringify(
                {
                    manifest: options.manifest,
                    apply: options.apply,
                    r2Acceptance: options.requireR2,
                    ...report.summary,
                },
                null,
                2,
            )}\n`,
        );
    } finally {
        if (migrationStorage) await migrationStorage.close();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    createMigrationStorage,
    helpText,
    parseArguments,
    syncObjects,
    validateR2Acceptance,
    validateR2Target,
    validateTrueType,
};
