"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const DEFAULT_SOURCE = "https://idol-master.top";
const CARD_PAGE_SIZE = 500;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

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
        "data/migration/legacy-namecards",
    );
    const options = {
        sourceBaseUrl: normalizedBaseUrl(
            environment.IMS_LEGACY_NAMECARD_BASE_URL || DEFAULT_SOURCE,
        ),
        staging: path.resolve(defaultStaging),
        manifest: path.resolve(defaultStaging, "manifest.json"),
        apply: false,
        confirmSource: "",
        confirmBucket: "",
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
        else if (argument === "--help" || argument === "-h")
            options.help = true;
        else throw new Error(`Unknown argument: ${argument}`);
    }
    if (!manifestExplicit)
        options.manifest = path.join(options.staging, "manifest.json");
    return options;
}

function helpText() {
    return [
        "Usage: pnpm run media:namecards:sync -- [options]",
        "",
        "Imports approved Legacy namecards, reactions, and verified images into PostgreSQL/S3.",
        "The command stages source media but does not change PostgreSQL or S3 unless --apply is used.",
        "",
        "Options:",
        `  --source-base-url <url>  Legacy origin (default: ${DEFAULT_SOURCE})`,
        "  --staging-dir <path>     Ignored media staging directory",
        "  --manifest <path>        JSON audit manifest",
        "  --apply                  Upload objects and reconcile database rows",
        "  --confirm-source <url>   Required exact source confirmation with --apply",
        "  --confirm-bucket <name>  Required exact IMS_S3_BUCKET confirmation with --apply",
        "  --help                   Show this help",
    ].join("\n");
}

function digest(algorithm, body) {
    return crypto.createHash(algorithm).update(body).digest("hex");
}

function sourceTimestamp(value) {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    ) {
        throw new Error(`Invalid Legacy namecard timestamp: ${String(value)}`);
    }
    const iso = `${value.replace(" ", "T")}Z`;
    if (!Number.isFinite(Date.parse(iso)))
        throw new Error(`Invalid Legacy namecard timestamp: ${value}`);
    return new Date(iso).toISOString();
}

function sourceMediaPath(value) {
    if (
        typeof value !== "string" ||
        !value.startsWith("/uploads/namecard/original/")
    ) {
        throw new Error(`Invalid Legacy namecard media URL: ${String(value)}`);
    }
    const parsed = new URL(value, "https://legacy.invalid");
    if (
        parsed.origin !== "https://legacy.invalid" ||
        parsed.search ||
        parsed.hash ||
        !parsed.pathname.startsWith("/uploads/namecard/original/") ||
        parsed.pathname === "/uploads/namecard/original/"
    ) {
        throw new Error(`Invalid Legacy namecard media URL: ${value}`);
    }
    return parsed.pathname;
}

function normalizeCard(value) {
    if (!value || typeof value !== "object")
        throw new Error("Legacy namecard row must be an object");
    const id = Number(value.id);
    if (!Number.isSafeInteger(id) || id < 1)
        throw new Error(`Invalid Legacy namecard ID: ${value.id}`);
    const hash1 = String(value.hash1 || "").toLowerCase();
    const hash2 = String(value.hash2 || "").toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(hash1) || !/^[a-f0-9]{32}$/.test(hash2)) {
        throw new Error(`Legacy namecard ${id} has an invalid media hash`);
    }
    if (value.status !== "approved")
        throw new Error(`Legacy public namecard ${id} is not approved`);
    return {
        id,
        sourceImage1Url: sourceMediaPath(value.image1_url),
        sourceImage2Url: sourceMediaPath(value.image2_url),
        hash1,
        hash2,
        ip:
            value.ip === null || value.ip === undefined
                ? null
                : String(value.ip),
        status: "approved",
        createdAt: sourceTimestamp(value.created_at),
    };
}

async function fetchJson(url, label) {
    const response = await fetchWithRetry(url, {
        headers: { Accept: "application/json" },
        timeoutMs: 60_000,
        label,
    });
    if (!response.ok)
        throw new Error(`${label} returned HTTP ${response.status}`);
    if (
        !(response.headers.get("content-type") || "")
            .toLowerCase()
            .includes("application/json")
    ) {
        throw new Error(`${label} returned non-JSON content`);
    }
    return response.json();
}

async function fetchWithRetry(url, options) {
    let lastError;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
            const response = await fetch(url, {
                headers: options.headers,
                signal: AbortSignal.timeout(options.timeoutMs),
            });
            if (
                response.ok ||
                (response.status < 500 && response.status !== 429)
            ) {
                return response;
            }
            lastError = new Error(
                `${options.label} returned HTTP ${response.status}`,
            );
        } catch (error) {
            lastError = error;
        }
        if (attempt < 4) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 250));
        }
    }
    throw new Error(
        `${options.label} failed after 4 attempts: ${lastError?.message || "unknown error"}`,
    );
}

async function fetchLegacyCards(sourceBaseUrl) {
    const cards = [];
    let expectedTotal = null;
    for (let page = 1; ; page += 1) {
        const url = new URL("/api/cards", sourceBaseUrl);
        url.searchParams.set("page", String(page));
        url.searchParams.set("size", String(CARD_PAGE_SIZE));
        const payload = await fetchJson(url, `Legacy namecard page ${page}`);
        if (
            !payload ||
            !Array.isArray(payload.list) ||
            !Number.isSafeInteger(Number(payload.total))
        ) {
            throw new Error(
                `Legacy namecard page ${page} has an invalid response shape`,
            );
        }
        const total = Number(payload.total);
        if (expectedTotal === null) expectedTotal = total;
        if (expectedTotal !== total)
            throw new Error("Legacy namecard total changed during export");
        cards.push(...payload.list.map(normalizeCard));
        if (!payload.list.length || cards.length >= total) break;
    }
    if (cards.length !== expectedTotal) {
        throw new Error(
            `Legacy namecard export returned ${cards.length} of ${expectedTotal} rows`,
        );
    }
    cards.sort((left, right) => left.id - right.id);
    if (new Set(cards.map((card) => card.id)).size !== cards.length) {
        throw new Error("Legacy namecard export contains duplicate IDs");
    }
    return cards;
}

async function mapConcurrent(values, concurrency, mapper) {
    const results = new Array(values.length);
    let cursor = 0;
    let failure;
    async function worker() {
        while (cursor < values.length && !failure) {
            const index = cursor++;
            try {
                results[index] = await mapper(values[index], index);
            } catch (error) {
                failure ||= error;
            }
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(concurrency, values.length) }, () =>
            worker(),
        ),
    );
    if (failure) throw failure;
    return results;
}

function normalizeReactions(value, cardId) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(
            `Legacy reactions for card ${cardId} must be an object`,
        );
    }
    return Object.entries(value)
        .map(([emoji, count]) => {
            const normalizedCount = Number(count);
            if (
                !emoji ||
                emoji.length > 32 ||
                !Number.isSafeInteger(normalizedCount) ||
                normalizedCount < 1
            ) {
                throw new Error(
                    `Legacy reactions for card ${cardId} contain an invalid value`,
                );
            }
            return { emoji, count: normalizedCount };
        })
        .sort((left, right) => left.emoji.localeCompare(right.emoji));
}

async function fetchLegacyReactions(sourceBaseUrl, cards) {
    const values = await mapConcurrent(cards, 12, async (card) => {
        const url = new URL("/api/reactions", sourceBaseUrl);
        url.searchParams.set("id", String(card.id));
        return [
            card.id,
            normalizeReactions(
                await fetchJson(url, `Legacy reactions for card ${card.id}`),
                card.id,
            ),
        ];
    });
    return new Map(values);
}

const IMAGE_FORMATS = new Map([
    ["jpeg", { extension: "jpg", contentType: "image/jpeg" }],
    ["png", { extension: "png", contentType: "image/png" }],
    ["webp", { extension: "webp", contentType: "image/webp" }],
    ["gif", { extension: "gif", contentType: "image/gif" }],
    ["avif", { extension: "avif", contentType: "image/avif" }],
]);

async function imageDetails(body, cardId, side) {
    if (!body.byteLength || body.byteLength > MAX_IMAGE_BYTES) {
        throw new Error(
            `Legacy namecard ${cardId} ${side} has an invalid byte size`,
        );
    }
    let metadata;
    try {
        metadata = await sharp(body, {
            animated: true,
            failOn: "error",
            // Legacy accepted some print-resolution cards above the current upload limit.
            limitInputPixels: 150 * 1000 * 1000,
        }).metadata();
    } catch {
        throw new Error(
            `Legacy namecard ${cardId} ${side} is not a decodable image`,
        );
    }
    const format = IMAGE_FORMATS.get(metadata.format);
    if (!format || !metadata.width || !metadata.height) {
        throw new Error(
            `Legacy namecard ${cardId} ${side} uses an unsupported image format`,
        );
    }
    return { ...format, width: metadata.width, height: metadata.height };
}

function targetFilename(cardId, side, extension) {
    if (
        !Number.isSafeInteger(cardId) ||
        cardId < 1 ||
        !["front", "back"].includes(side) ||
        !/^[a-z0-9]+$/.test(extension)
    ) {
        throw new Error("Invalid canonical namecard media components");
    }
    return `card-${cardId}-${side}.${extension}`;
}

function targetUrl(filename) {
    return `/uploads/namecard/original/${filename}`;
}

async function cachedMedia(mediaDirectory, cardId, side, expectedMd5) {
    let names = [];
    try {
        names = await fs.readdir(mediaDirectory);
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
    const prefix = `card-${cardId}-${side}.`;
    for (const name of names
        .filter((entry) => entry.startsWith(prefix))
        .sort()) {
        const stagingPath = path.join(mediaDirectory, name);
        const body = await fs.readFile(stagingPath);
        if (digest("md5", body) !== expectedMd5) continue;
        const details = await imageDetails(body, cardId, side);
        if (name !== targetFilename(cardId, side, details.extension)) continue;
        return { body, stagingPath, details, stagedFrom: "cache" };
    }
    return null;
}

function canonicalMedia(input, staged) {
    const filename = path.basename(staged.stagingPath);
    return {
        cardId: input.cardId,
        side: input.side,
        sourceUrl: input.sourcePath,
        filename,
        url: targetUrl(filename),
        stagingPath: staged.stagingPath,
        bytes: staged.body.byteLength,
        contentType: staged.details.contentType,
        width: staged.details.width,
        height: staged.details.height,
        md5: input.expectedMd5,
        sha256: digest("sha256", staged.body),
        stagedFrom: staged.stagedFrom,
        body: staged.body,
    };
}

async function stageMedia(sourceBaseUrl, mediaDirectory, input) {
    const cached = await cachedMedia(
        mediaDirectory,
        input.cardId,
        input.side,
        input.expectedMd5,
    );
    if (cached) return canonicalMedia(input, cached);
    let stagedFrom = "download";
    let response = await fetchWithRetry(
        new URL(input.sourcePath, sourceBaseUrl),
        {
            timeoutMs: 90_000,
            label: `Legacy namecard ${input.cardId} ${input.side}`,
        },
    );
    if (response.status === 404 && input.sourcePath.includes("%")) {
        const encodedPercentPath = input.sourcePath.replaceAll("%", "%25");
        response = await fetchWithRetry(
            new URL(encodedPercentPath, sourceBaseUrl),
            {
                timeoutMs: 90_000,
                label: `Legacy namecard ${input.cardId} ${input.side} encoded-path recovery`,
            },
        );
        if (response.ok) stagedFrom = "download-encoded-path-recovery";
    }
    if (!response.ok) {
        throw new Error(
            `Legacy namecard ${input.cardId} ${input.side} returned HTTP ${response.status}`,
        );
    }
    const body = Buffer.from(await response.arrayBuffer());
    const actualMd5 = digest("md5", body);
    if (actualMd5 !== input.expectedMd5) {
        throw new Error(
            `Legacy namecard ${input.cardId} ${input.side} MD5 mismatch: ` +
                `expected ${input.expectedMd5}, received ${actualMd5}`,
        );
    }
    const details = await imageDetails(body, input.cardId, input.side);
    const stagingPath = path.join(
        mediaDirectory,
        targetFilename(input.cardId, input.side, details.extension),
    );
    await fs.mkdir(mediaDirectory, { recursive: true });
    const temporary = `${stagingPath}.tmp-${process.pid}`;
    await fs.writeFile(temporary, body, { mode: 0o600 });
    await fs.rename(temporary, stagingPath);
    return canonicalMedia(input, { body, stagingPath, details, stagedFrom });
}

async function stageAllMedia(sourceBaseUrl, staging, cards) {
    const inputs = cards.flatMap((card) => [
        {
            cardId: card.id,
            side: "front",
            sourcePath: card.sourceImage1Url,
            expectedMd5: card.hash1,
        },
        {
            cardId: card.id,
            side: "back",
            sourcePath: card.sourceImage2Url,
            expectedMd5: card.hash2,
        },
    ]);
    const mediaDirectory = path.join(staging, "media");
    return mapConcurrent(inputs, 8, async (input, index) => {
        const media = await stageMedia(sourceBaseUrl, mediaDirectory, input);
        if ((index + 1) % 50 === 0 || index + 1 === inputs.length) {
            process.stderr.write(
                `Staged ${index + 1}/${inputs.length} namecard images\n`,
            );
        }
        return media;
    });
}

function reactionSignature(values) {
    return JSON.stringify(
        [...values]
            .map((value) => ({
                emoji: value.emoji,
                count: Number(value.count),
            }))
            .sort((left, right) => left.emoji.localeCompare(right.emoji)),
    );
}

async function readTargetState(client, cards, reactions, mediaByCard) {
    const ids = cards.map((card) => card.id);
    const cardResult = await client.query(
        `SELECT id, image1_url, image2_url, hash1, hash2, ip, status, created_at
         FROM cards WHERE id = ANY($1::bigint[])`,
        [ids],
    );
    const existingCards = new Map(
        cardResult.rows.map((row) => [Number(row.id), row]),
    );
    const reactionResult = await client.query(
        `SELECT card_id, emoji, count FROM card_emojis
         WHERE card_id = ANY($1::bigint[]) ORDER BY card_id, emoji`,
        [ids],
    );
    const existingReactions = new Map();
    for (const row of reactionResult.rows) {
        const cardId = Number(row.card_id);
        const current = existingReactions.get(cardId) || [];
        current.push({ emoji: row.emoji, count: Number(row.count) });
        existingReactions.set(cardId, current);
    }
    return cards.map((card) => {
        const media = mediaByCard.get(card.id);
        const existing = existingCards.get(card.id);
        const expectedValues = [
            media.front.url,
            media.back.url,
            card.hash1,
            card.hash2,
            card.ip,
            card.status,
            card.createdAt,
        ];
        const existingValues = existing
            ? [
                  existing.image1_url,
                  existing.image2_url,
                  existing.hash1,
                  existing.hash2,
                  existing.ip,
                  existing.status,
                  new Date(existing.created_at).toISOString(),
              ]
            : null;
        return {
            id: card.id,
            rowStatus: !existing
                ? "missing"
                : JSON.stringify(existingValues) ===
                    JSON.stringify(expectedValues)
                  ? "unchanged"
                  : "would-update",
            reactionStatus:
                reactionSignature(existingReactions.get(card.id) || []) ===
                reactionSignature(reactions.get(card.id) || [])
                    ? "unchanged"
                    : "would-update",
        };
    });
}

async function syncObjects(storage, media, apply, objectKeyForFilename) {
    return mapConcurrent(media, 4, async (entry, index) => {
        const key = objectKeyForFilename(entry.filename);
        const existing = await storage.get(key);
        const matches =
            existing !== null &&
            existing.size === entry.bytes &&
            digest("sha256", existing.body) === entry.sha256;
        let objectStatus;
        if (matches) objectStatus = "unchanged";
        else if (!apply)
            objectStatus = existing ? "would-replace" : "would-upload";
        else {
            objectStatus = existing ? "replaced" : "uploaded";
            await storage.put(key, entry.body, {
                contentType: entry.contentType,
                sha256: entry.sha256,
                metadata: {
                    source: "legacy-namecard-import",
                    cardId: String(entry.cardId),
                    side: entry.side,
                },
            });
            const stored = await storage.get(key);
            if (
                !stored ||
                stored.size !== entry.bytes ||
                digest("sha256", stored.body) !== entry.sha256
            ) {
                throw new Error(
                    `Object verification failed after writing ${key}`,
                );
            }
        }
        if ((index + 1) % 50 === 0 || index + 1 === media.length) {
            process.stderr.write(
                `Checked ${index + 1}/${media.length} target objects\n`,
            );
        }
        return { ...entry, key, objectStatus };
    });
}

async function reconcileDatabase(client, cards, reactions, mediaByCard) {
    await client.query("BEGIN");
    try {
        for (const card of cards) {
            const media = mediaByCard.get(card.id);
            await client.query(
                `INSERT INTO cards
                 (id, image1_url, image2_url, hash1, hash2, ip, status, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
                 ON CONFLICT (id) DO UPDATE SET
                    image1_url=EXCLUDED.image1_url, image2_url=EXCLUDED.image2_url,
                    hash1=EXCLUDED.hash1, hash2=EXCLUDED.hash2, ip=EXCLUDED.ip,
                    status=EXCLUDED.status, created_at=EXCLUDED.created_at`,
                [
                    card.id,
                    media.front.url,
                    media.back.url,
                    card.hash1,
                    card.hash2,
                    card.ip,
                    card.status,
                    card.createdAt,
                ],
            );
        }
        const ids = cards.map((card) => card.id);
        await client.query(
            "DELETE FROM card_emojis WHERE card_id = ANY($1::bigint[])",
            [ids],
        );
        for (const card of cards) {
            for (const reaction of reactions.get(card.id) || []) {
                await client.query(
                    "INSERT INTO card_emojis (card_id, emoji, count) VALUES ($1, $2, $3)",
                    [card.id, reaction.emoji, reaction.count],
                );
            }
        }
        await client.query(
            `SELECT setval(pg_get_serial_sequence('public.cards', 'id'),
                COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM cards`,
        );
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
}

function countBy(values, field) {
    const result = {};
    for (const value of values)
        result[value[field]] = (result[value[field]] || 0) + 1;
    return result;
}

async function writeManifest(target, report) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}`;
    await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, {
        mode: 0o600,
    });
    await fs.rename(temporary, target);
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
    if (!process.env.DATABASE_URL) {
        throw new Error(
            "Legacy namecard migration requires configured PostgreSQL",
        );
    }
    const {
        parseNodeObjectStorageConfig,
    } = require("../../src/config/object-storage.ts");
    if (parseNodeObjectStorageConfig().type !== "s3") {
        throw new Error(
            "Legacy namecard migration requires IMS_OBJECT_STORAGE=s3",
        );
    }

    process.stderr.write(
        `Reading Legacy namecards from ${options.sourceBaseUrl}\n`,
    );
    const cards = await fetchLegacyCards(options.sourceBaseUrl);
    const [reactions, media] = await Promise.all([
        fetchLegacyReactions(options.sourceBaseUrl, cards),
        stageAllMedia(options.sourceBaseUrl, options.staging, cards),
    ]);
    const mediaByCard = new Map();
    for (const entry of media) {
        const current = mediaByCard.get(entry.cardId) || {};
        current[entry.side] = entry;
        mediaByCard.set(entry.cardId, current);
    }

    const { Client } = require("pg");
    const {
        namecardImageObjectKey,
    } = require("../../src/utils/storage/business-object-keys.ts");
    const {
        closeNodeServices,
        resolveNodeServices,
    } = require("../../src/runtime/node-services.ts");
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: Number(
            process.env.IMS_PG_CONNECTION_TIMEOUT_MS || 5000,
        ),
    });
    let services;
    try {
        await client.connect();
        services = await resolveNodeServices();
        if (!services.storage) throw new Error("Object storage is unavailable");
        const before = await readTargetState(
            client,
            cards,
            reactions,
            mediaByCard,
        );
        const syncedMedia = await syncObjects(
            services.storage,
            media,
            options.apply,
            namecardImageObjectKey,
        );
        if (options.apply) {
            await reconcileDatabase(client, cards, reactions, mediaByCard);
            const verified = await readTargetState(
                client,
                cards,
                reactions,
                mediaByCard,
            );
            if (
                verified.some(
                    (entry) =>
                        entry.rowStatus !== "unchanged" ||
                        entry.reactionStatus !== "unchanged",
                )
            ) {
                throw new Error(
                    "Database verification failed after Legacy namecard import",
                );
            }
        }

        const reactionRows = [...reactions.values()].reduce(
            (total, values) => total + values.length,
            0,
        );
        const report = {
            generatedAt: new Date().toISOString(),
            sourceBaseUrl: options.sourceBaseUrl,
            targetBucket: bucket,
            targetPrefix: process.env.IMS_S3_PREFIX || "",
            apply: options.apply,
            summary: {
                cardCount: cards.length,
                mediaCount: syncedMedia.length,
                mediaBytes: syncedMedia.reduce(
                    (total, entry) => total + entry.bytes,
                    0,
                ),
                reactionRows,
                reactionCount: [...reactions.values()]
                    .flat()
                    .reduce((total, value) => total + value.count, 0),
                databaseBefore: {
                    rows: countBy(before, "rowStatus"),
                    reactions: countBy(before, "reactionStatus"),
                },
                objects: countBy(syncedMedia, "objectStatus"),
            },
            cards: cards.map((card) => {
                const target = mediaByCard.get(card.id);
                const state = before.find((entry) => entry.id === card.id);
                return {
                    id: card.id,
                    status: card.status,
                    createdAt: card.createdAt,
                    image1Url: target.front.url,
                    image2Url: target.back.url,
                    reactionRows: (reactions.get(card.id) || []).length,
                    databaseStatusBefore: state.rowStatus,
                    reactionStatusBefore: state.reactionStatus,
                };
            }),
            media: syncedMedia.map(({ body, ...entry }) => entry),
        };
        await writeManifest(options.manifest, report);
        process.stdout.write(
            `${JSON.stringify(
                {
                    manifest: options.manifest,
                    apply: options.apply,
                    ...report.summary,
                },
                null,
                2,
            )}\n`,
        );
    } finally {
        await client.end().catch(() => undefined);
        if (services) await closeNodeServices();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    fetchLegacyCards,
    helpText,
    normalizeCard,
    normalizeReactions,
    parseArguments,
    sourceTimestamp,
    targetFilename,
    targetUrl,
};
