"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
    DeleteObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    S3Client,
} = require("@aws-sdk/client-s3");

const LEGACY_SCOPES = [
    "Data/",
    "Wiki/",
    "uploads/",
    "assets/images/eventchronicle/events/",
    "site-packages/",
];

function fileParts(filename) {
    const separator = filename.lastIndexOf(".");
    if (separator <= 0 || separator === filename.length - 1) {
        return { stem: filename, extension: "bin" };
    }
    return {
        stem: filename.slice(0, separator),
        extension: filename.slice(separator + 1).toLowerCase(),
    };
}

function mediaObjectKey(key) {
    if (key === "uploads/information/index.json")
        return "editorial/information/index.json";
    const segments = key.split("/");
    const filename = segments.at(-1);
    const prefix = segments.slice(0, -1).join("/").toLowerCase();
    const file = fileParts(filename);
    if (prefix === "uploads/news/original") {
        return `editorial/news/assets/${file.stem}/original.${file.extension}`;
    }
    if (prefix === "uploads/news/thumb") {
        return `editorial/news/assets/${file.stem.replace(/_thumb$/i, "")}/thumbnail.${file.extension}`;
    }
    if (
        [
            "uploads/event/original",
            "uploads/event/thumb",
            "uploads/events",
        ].includes(prefix)
    ) {
        return `editorial/events/assets/${file.stem}/poster.${file.extension}`;
    }
    if (
        ["uploads/information", "uploads/information/original"].includes(prefix)
    ) {
        return `editorial/information/assets/${file.stem}/cover.${file.extension}`;
    }
    if (prefix === "uploads/namecard/original") {
        return `community/namecards/assets/${file.stem}/image.${file.extension}`;
    }
    if (prefix === "uploads/namecard/thumbnail") {
        const suffix = ".jpg";
        if (
            !filename.toLowerCase().endsWith(suffix) ||
            filename.length === suffix.length
        ) {
            throw new Error(`Unsupported namecard thumbnail key: ${key}`);
        }
        return `community/namecards/assets/${fileParts(filename.slice(0, -suffix.length)).stem}/thumbnail.jpg`;
    }
    if (prefix === "uploads/producer-map") {
        return `community/producer-map/assets/${file.stem}/image.${file.extension}`;
    }
    throw new Error(`Unsupported uploads key: ${key}`);
}

function semanticObjectKey(key) {
    const segments = key.split("/");
    if (segments[0] === "Data" && segments.length >= 4) {
        const [, agency, idol, ...relative] = segments;
        if (/^icon\.[^.]+$/i.test(relative.join("/"))) {
            return `wiki/agencies/${agency}/idols/${idol}/${relative.join("/").replace(/^icon/, "avatar")}`;
        }
        return `wiki/agencies/${agency}/idols/${idol}/story-images/${relative.join("/")}`;
    }
    if (key.startsWith("Wiki/static/icon/agencies/")) {
        const code = path.posix.basename(key, path.posix.extname(key));
        return `wiki/agencies/${code}/branding/icon${path.posix.extname(key).toLowerCase()}`;
    }
    if (
        segments[0] === "Wiki" &&
        segments[1] === "static" &&
        segments.length >= 4
    ) {
        return `wiki/shared/static/${segments.slice(2).join("/")}`;
    }
    if (key.startsWith("Wiki/")) {
        return `system/migrations/wiki/${segments.slice(1).join("/")}`;
    }
    if (key.startsWith("uploads/")) return mediaObjectKey(key);
    if (key.startsWith("assets/images/eventchronicle/events/")) {
        const [bucket, activityId, ...filename] = segments.slice(4);
        const roots = {
            upload: "chronicle/media/pending",
            used: "chronicle/media/published",
            meta: "chronicle/metadata",
            ".trash": "chronicle/trash",
        };
        const root = roots[bucket];
        if (!root) throw new Error(`Unsupported Chronicle key: ${key}`);
        return [root, activityId, ...filename].filter(Boolean).join("/");
    }
    if (key.startsWith("site-packages/")) return key;
    throw new Error(`Unsupported object key: ${key}`);
}

function parseArguments(argv, environment = process.env) {
    const projectRoot = path.resolve(__dirname, "../../../..");
    const options = {
        apply: false,
        deleteSource: false,
        confirmBucket: "",
        concurrency: 6,
        manifest: "",
        help: false,
        bucket: environment.IMS_S3_BUCKET?.trim() || "",
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === "--") continue;
        const next = () => {
            const value = argv[++index];
            if (!value || value.startsWith("--"))
                throw new Error(`${argument} requires a value`);
            return value;
        };
        if (argument === "--apply") options.apply = true;
        else if (argument === "--delete-source") options.deleteSource = true;
        else if (argument === "--confirm-bucket")
            options.confirmBucket = next();
        else if (argument === "--concurrency")
            options.concurrency = Number(next());
        else if (argument === "--manifest")
            options.manifest = path.resolve(next());
        else if (argument === "--help" || argument === "-h")
            options.help = true;
        else throw new Error(`Unknown argument: ${argument}`);
    }
    if (
        !Number.isSafeInteger(options.concurrency) ||
        options.concurrency < 1 ||
        options.concurrency > 16
    ) {
        throw new Error("--concurrency must be an integer between 1 and 16");
    }
    if (options.deleteSource && !options.apply)
        throw new Error("--delete-source requires --apply");
    if (
        options.apply &&
        (!options.bucket || options.confirmBucket !== options.bucket)
    ) {
        throw new Error(
            `Apply requires --confirm-bucket ${options.bucket || "<IMS_S3_BUCKET>"}`,
        );
    }
    if (!options.manifest) {
        options.manifest = path.join(
            projectRoot,
            "data/migration",
            options.apply
                ? "semantic-object-keys.json"
                : "semantic-object-keys-dry-run.json",
        );
    }
    return options;
}

function helpText() {
    return [
        "Usage: pnpm run migration:object-keys -- [options]",
        "",
        "Migrates legacy logical keys and managed objects to semantic object keys.",
        "The command is read-only unless --apply is provided.",
        "",
        "Options:",
        "  --apply                    Write and verify canonical objects",
        "  --delete-source            Delete old logical keys after verification",
        "  --confirm-bucket <bucket>  Required exact bucket confirmation for --apply",
        "  --concurrency <1-16>       Parallel object count (default: 6)",
        "  --manifest <file>          Audit report path",
        "  --help                     Show this help",
    ].join("\n");
}

function digest(body) {
    return crypto.createHash("sha256").update(body).digest("hex");
}

function physicalKey(config, logicalKey) {
    return config.prefix ? `${config.prefix}/${logicalKey}` : logicalKey;
}

function indexedSourcePhysicalKey(config, snapshot) {
    return (
        snapshot.physicalKey ||
        physicalKey(config, `__ims_s3/objects/${snapshot.objectId}`)
    );
}

function semanticPhysicalKey(config, logicalKey, objectId) {
    const directory = path.posix.dirname(logicalKey);
    return physicalKey(
        config,
        `${directory === "." ? "_root" : directory}/objects/${objectId}/${path.posix.basename(logicalKey)}`,
    );
}

function missingS3Object(error) {
    return (
        error?.$metadata?.httpStatusCode === 404 ||
        ["NoSuchKey", "NotFound"].includes(error?.name)
    );
}

async function rawGet(client, config, logicalKey) {
    return rawGetPhysical(
        client,
        config,
        physicalKey(config, logicalKey),
        logicalKey,
    );
}

async function rawGetPhysical(client, config, objectKey, label = objectKey) {
    try {
        const object = await client.send(
            new GetObjectCommand({
                Bucket: config.bucket,
                Key: objectKey,
            }),
        );
        if (!object.Body) throw new Error(`S3 object has no body: ${label}`);
        const body = await object.Body.transformToByteArray();
        return {
            body,
            size: body.byteLength,
            contentType: object.ContentType || "application/octet-stream",
        };
    } catch (error) {
        if (missingS3Object(error)) return null;
        throw error;
    }
}

async function listRaw(client, config, prefix) {
    const entries = [];
    let continuationToken;
    do {
        const page = await client.send(
            new ListObjectsV2Command({
                Bucket: config.bucket,
                Prefix: physicalKey(config, prefix),
                ContinuationToken: continuationToken,
            }),
        );
        for (const object of page.Contents || []) {
            if (!object.Key) continue;
            const logicalKey = config.prefix
                ? object.Key.slice(`${config.prefix}/`.length)
                : object.Key;
            entries.push({
                source: logicalKey,
                destination: semanticObjectKey(logicalKey),
                size: object.Size || 0,
                sourceKind: "direct",
            });
        }
        continuationToken = page.IsTruncated
            ? page.NextContinuationToken
            : undefined;
    } while (continuationToken);
    return entries;
}

async function inventory(storage, state, client, config) {
    const entries = new Map();
    for (const prefix of LEGACY_SCOPES) {
        for (const object of await storage.list(prefix)) {
            if (!object.key.startsWith(prefix)) continue;
            const snapshot = await state.snapshot(object.key);
            if (!snapshot || !["pending", "ready"].includes(snapshot.state)) {
                throw new Error(
                    `Managed migration source has no readable state: ${object.key}`,
                );
            }
            const destination = semanticObjectKey(object.key);
            const sourcePhysicalKey = indexedSourcePhysicalKey(
                config,
                snapshot,
            );
            if (
                object.key === destination &&
                sourcePhysicalKey ===
                    semanticPhysicalKey(config, object.key, snapshot.objectId)
            ) {
                continue;
            }
            entries.set(object.key, {
                source: object.key,
                destination,
                size: object.size,
                sourceKind: "indexed",
                sourceObjectId: snapshot.objectId,
                sourcePhysicalKey,
            });
        }
    }
    for (const prefix of LEGACY_SCOPES.filter(
        (scope) => scope !== "site-packages/",
    )) {
        for (const entry of await listRaw(client, config, prefix)) {
            if (!entries.has(entry.source)) entries.set(entry.source, entry);
        }
    }
    const destinations = new Map();
    for (const entry of entries.values()) {
        const existing = destinations.get(entry.destination);
        if (existing && existing !== entry.source) {
            throw new Error(
                `Migration key collision: ${existing} and ${entry.source} -> ${entry.destination}`,
            );
        }
        destinations.set(entry.destination, entry.source);
    }
    return [...entries.values()].sort((left, right) =>
        left.source.localeCompare(right.source),
    );
}

async function migrateEntry(storage, state, client, config, entry, options) {
    const source =
        entry.sourceKind === "indexed"
            ? await rawGetPhysical(
                  client,
                  config,
                  entry.sourcePhysicalKey,
                  entry.source,
              )
            : await rawGet(client, config, entry.source);
    if (!source) throw new Error(`Source disappeared: ${entry.source}`);
    const sourceSha256 = digest(source.body);
    let destination =
        entry.source === entry.destination
            ? null
            : await storage.get(entry.destination);
    let rewritten = false;
    if (
        !destination ||
        digest(destination.body) !== sourceSha256 ||
        entry.source === entry.destination
    ) {
        destination = await storage.put(entry.destination, source.body, {
            contentType: source.contentType,
            sha256: sourceSha256,
        });
        rewritten = true;
    }
    const verified = await storage.get(entry.destination);
    if (
        !verified ||
        verified.size !== source.size ||
        digest(verified.body) !== sourceSha256
    ) {
        throw new Error(`Verification failed: ${entry.destination}`);
    }
    if (options.deleteSource) {
        if (entry.sourceKind === "indexed") {
            if (entry.source !== entry.destination)
                await storage.delete(entry.source);
            await client.send(
                new DeleteObjectCommand({
                    Bucket: config.bucket,
                    Key: entry.sourcePhysicalKey,
                }),
            );
            await state.removeVersionIfUnreferenced(entry.sourceObjectId);
        } else if (entry.source !== entry.destination) {
            await client.send(
                new DeleteObjectCommand({
                    Bucket: config.bucket,
                    Key: physicalKey(config, entry.source),
                }),
            );
        }
        const remaining =
            entry.sourceKind === "indexed"
                ? Boolean(
                      await rawGetPhysical(
                          client,
                          config,
                          entry.sourcePhysicalKey,
                          entry.source,
                      ),
                  )
                : entry.source === entry.destination
                  ? false
                  : Boolean(await rawGet(client, config, entry.source));
        if (remaining) {
            throw new Error(`Source deletion failed: ${entry.source}`);
        }
    }
    return { ...entry, sha256: sourceSha256, rewritten, verified: true };
}

async function parallelMap(entries, concurrency, operation) {
    const results = new Array(entries.length);
    let cursor = 0;
    async function consume() {
        while (cursor < entries.length) {
            const index = cursor++;
            results[index] = await operation(entries[index], index);
        }
    }
    const workers = Array.from(
        { length: Math.min(concurrency, entries.length) },
        () => consume(),
    );
    await Promise.all(workers);
    return results;
}

async function writeManifest(filename, report) {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, {
        mode: 0o600,
    });
    await fs.rename(temporary, filename);
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(`${helpText()}\n`);
        return;
    }
    require("../../src/config/load-environment.ts");
    const {
        parseNodeObjectStorageConfig,
    } = require("../../src/config/object-storage.ts");
    const config = parseNodeObjectStorageConfig();
    if (config.type !== "s3")
        throw new Error("Semantic object migration requires S3 storage");
    const client = new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
    });
    const {
        closeNodeServices,
        resolveNodeServices,
    } = require("../../src/runtime/node-services.ts");
    const { parseNodeDatabaseConfig } = require("../../src/config/database.ts");
    const {
        PostgresConnection,
    } = require("../../src/infra/db/postgresql/connection.ts");
    const {
        S3UploadStateMachine,
    } = require("../../src/infra/oss/s3/upload-state-machine.ts");
    const databaseConfig = parseNodeDatabaseConfig(process.env);
    const database = PostgresConnection.create(databaseConfig);
    const state = new S3UploadStateMachine(database);
    try {
        await state.initialize();
        const services = await resolveNodeServices();
        const entries = await inventory(
            services.storage,
            state,
            client,
            config,
        );
        const startedAt = new Date().toISOString();
        let migrated = [];
        if (options.apply) {
            migrated = await parallelMap(
                entries,
                options.concurrency,
                async (entry, index) => {
                    const result = await migrateEntry(
                        services.storage,
                        state,
                        client,
                        config,
                        entry,
                        options,
                    );
                    if (
                        (index + 1) % 100 === 0 ||
                        index + 1 === entries.length
                    ) {
                        process.stderr.write(
                            `Migrated ${index + 1}/${entries.length}\n`,
                        );
                    }
                    return result;
                },
            );
            await services.compensation?.run(services.storage, 1000);
        }
        const report = {
            version: 1,
            startedAt,
            completedAt: new Date().toISOString(),
            bucket: config.bucket,
            prefix: config.prefix,
            apply: options.apply,
            deleteSource: options.deleteSource,
            summary: {
                objects: entries.length,
                bytes: entries.reduce((sum, entry) => sum + entry.size, 0),
                rewritten: migrated.filter((entry) => entry.rewritten).length,
                verified: migrated.filter((entry) => entry.verified).length,
            },
            entries: options.apply ? migrated : entries,
        };
        await writeManifest(options.manifest, report);
        process.stdout.write(
            `${JSON.stringify(
                {
                    manifest: options.manifest,
                    ...report.summary,
                    apply: report.apply,
                    deleteSource: report.deleteSource,
                },
                null,
                2,
            )}\n`,
        );
    } finally {
        client.destroy();
        await Promise.allSettled([closeNodeServices(), database.close()]);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    LEGACY_SCOPES,
    helpText,
    indexedSourcePhysicalKey,
    mediaObjectKey,
    parseArguments,
    semanticPhysicalKey,
    semanticObjectKey,
};
