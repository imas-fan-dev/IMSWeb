"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const DEFAULT_SOURCE = "https://idol-master.top";
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const IMAGE_FORMATS = new Map([
    ["jpeg", { extension: "jpg", contentType: "image/jpeg" }],
    ["png", { extension: "png", contentType: "image/png" }],
    ["webp", { extension: "webp", contentType: "image/webp" }],
    ["gif", { extension: "gif", contentType: "image/gif" }],
    ["avif", { extension: "avif", contentType: "image/avif" }],
]);
const COMMUNITY_METADATA = new Map([
    ["站长小窝", { id: "site-owner-lounge", series: "all" }],
    ["大部分都能唠些的闪耀色彩群", { id: "shiny-colors-lounge", series: "sc" }],
    ["WORLD OF W@RSHIPS", { id: "world-of-warships", series: "all" }],
    ["闪耀雷普（偶像大师战雷群）", { id: "war-thunder-lounge", series: "sc" }],
    ["U149同好群", { id: "u149-lounge", series: "cg" }],
    ["偶球群", { id: "idol-sports-lounge", series: "all" }],
    [
        "潮汕微信官号",
        {
            id: "chaoshan-wechat",
            platform: "微信",
            region: "广东省",
            series: "all",
        },
    ],
    ["Pの塔科夫", { id: "producer-tarkov", series: "all" }],
    ["一番星の小窝", { id: "ichibanboshi-lounge", series: "all" }],
]);

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
        "data/migration/legacy-producer-map",
    );
    const options = {
        sourceBaseUrl: normalizedBaseUrl(
            environment.IMS_LEGACY_PRODUCER_MAP_BASE_URL || DEFAULT_SOURCE,
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
        "Usage: pnpm run media:producer-map:sync -- [options]",
        "",
        "Pulls the current public Producer Map page, province images, and community images",
        "into canonical object storage. Source media is staged, but storage is read-only",
        "unless --apply is provided.",
        "",
        "Options:",
        `  --source-base-url <url>  Legacy origin (default: ${DEFAULT_SOURCE})`,
        "  --staging-dir <path>     Ignored media staging directory",
        "  --manifest <path>        JSON audit manifest",
        "  --apply                  Upload media and conditionally update the map config",
        "  --confirm-source <url>   Required exact source confirmation with --apply",
        "  --confirm-bucket <name>  Required exact IMS_S3_BUCKET confirmation with --apply",
        "  --require-r2             Require a read-only Cloudflare R2 acceptance run",
        "  --expect-bucket <name>   Exact bucket required by --require-r2",
        "  --expect-empty-prefix    Require an empty prefix with --require-r2",
        "  --help                   Show this help",
    ].join("\n");
}

function validateR2Target(config, expectedBucket, expectEmptyPrefix) {
    if (config.type !== "s3") {
        throw new Error("R2 acceptance requires IMS_OBJECT_STORAGE=s3");
    }
    if (config.bucket !== expectedBucket) {
        throw new Error(
            `R2 acceptance requires IMS_S3_BUCKET=${expectedBucket}`,
        );
    }
    if (config.region !== "auto") {
        throw new Error("R2 acceptance requires IMS_S3_REGION=auto");
    }
    if (!config.endpoint) {
        throw new Error("R2 acceptance requires IMS_S3_ENDPOINT");
    }
    let endpoint;
    try {
        endpoint = new URL(config.endpoint);
    } catch (error) {
        throw new Error(
            `R2 acceptance received an invalid IMS_S3_ENDPOINT: ${config.endpoint}`,
            {
                cause: error,
            },
        );
    }
    if (
        endpoint.protocol !== "https:" ||
        !endpoint.hostname.endsWith(".r2.cloudflarestorage.com") ||
        endpoint.pathname !== "/"
    ) {
        throw new Error(
            "R2 acceptance requires the Cloudflare R2 S3 API endpoint",
        );
    }
    if (expectEmptyPrefix && config.prefix !== "") {
        throw new Error("R2 acceptance requires an empty IMS_S3_PREFIX");
    }
}

function validateR2Acceptance(result) {
    const nonMatchingObjects = result.media.filter(
        (item) => item.objectStatus !== "unchanged",
    );
    if (
        result.configStatus !== "unchanged" ||
        result.regionsAdded !== 0 ||
        result.communitiesAdded !== 0 ||
        result.imagesLinked !== 0 ||
        nonMatchingObjects.length !== 0
    ) {
        throw new Error(
            "R2 acceptance failed: Producer Map configuration or media differs from the source",
        );
    }
}

async function fetchWithRetry(url, label) {
    let lastError;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
            const response = await fetch(url, {
                headers: { "User-Agent": "IMSWeb producer-map migration/1.0" },
                signal: AbortSignal.timeout(90_000),
            });
            if (
                response.ok ||
                (response.status < 500 && response.status !== 429)
            ) {
                return response;
            }
            lastError = new Error(`${label} returned HTTP ${response.status}`);
        } catch (error) {
            lastError = error;
        }
        if (attempt < 4) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 250));
        }
    }
    throw new Error(
        `${label} failed after 4 attempts: ${lastError?.message || "unknown error"}`,
    );
}

async function fetchText(url, label) {
    const response = await fetchWithRetry(url, label);
    if (!response.ok)
        throw new Error(`${label} returned HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.byteLength || body.byteLength > MAX_TEXT_BYTES) {
        throw new Error(`${label} has an invalid byte size`);
    }
    return { body, text: body.toString("utf8") };
}

function attributes(node) {
    return new Map(
        (node.attrs || []).map((attribute) => [
            attribute.name,
            attribute.value,
        ]),
    );
}

function nodeText(node) {
    if (node.nodeName === "#text") return node.value || "";
    return (node.childNodes || []).map(nodeText).join("");
}

function descendants(node, predicate, result = []) {
    if (predicate(node)) result.push(node);
    for (const child of node.childNodes || [])
        descendants(child, predicate, result);
    return result;
}

function sourcePath(value, directory, label) {
    const parsed = new URL(value, "https://legacy.invalid");
    if (
        parsed.origin !== "https://legacy.invalid" ||
        parsed.search ||
        parsed.hash ||
        !parsed.pathname.startsWith(directory) ||
        parsed.pathname === directory
    ) {
        throw new Error(`${label} has an invalid source path: ${value}`);
    }
    return parsed.pathname;
}

function fallbackCommunityId(name) {
    return `legacy-community-${digest(Buffer.from(name)).slice(0, 12)}`;
}

async function parseLegacyPage(html) {
    const { parse } = await import("parse5");
    const document = parse(html);
    const headings = descendants(document, (node) => node.tagName === "h1");
    const subtitles = descendants(
        document,
        (node) =>
            node.tagName === "p" && nodeText(node).includes("THE IDOLM@STER"),
    );
    const cards = descendants(document, (node) => {
        if (node.tagName !== "a") return false;
        return (attributes(node).get("class") || "")
            .split(/\s+/)
            .includes("infonews-card");
    });
    const title = nodeText(headings[0] || {}).trim();
    const subtitle = nodeText(subtitles[0] || {}).trim();
    if (!title || !subtitle || !cards.length || cards.length > 100) {
        throw new Error(
            "Legacy Producer Map page has an invalid content shape",
        );
    }
    const communities = cards.map((card) => {
        const name = nodeText(card).trim();
        const imagePath = sourcePath(
            attributes(card).get("data-img") || "",
            "/assets/images/qqcount/",
            `Legacy community ${name || "<unnamed>"}`,
        );
        const metadata = COMMUNITY_METADATA.get(name) || {};
        return {
            id: metadata.id || fallbackCommunityId(name),
            name,
            platform: metadata.platform || "QQ",
            region: metadata.region || null,
            series: metadata.series || "all",
            sourcePath: imagePath,
        };
    });
    if (
        communities.some((item) => !item.name) ||
        new Set(communities.map((item) => item.name)).size !==
            communities.length
    ) {
        throw new Error(
            "Legacy Producer Map communities are empty or duplicated",
        );
    }
    return { title, subtitle, communities };
}

function parseLegacyMapScript(script, provinces) {
    const declaration = script.indexOf("const imgMap");
    const start = script.indexOf("{", declaration);
    const end = script.indexOf("};", start);
    if (declaration < 0 || start < 0 || end < 0) {
        throw new Error("Legacy Producer Map script is missing imgMap");
    }
    const entries = [];
    const pattern = /"([^"]+)"\s*:\s*"([^"]+)"/g;
    for (const match of script.slice(start + 1, end).matchAll(pattern)) {
        const province = match[1].trim();
        const imagePath = sourcePath(
            match[2],
            "/assets/images/maps/",
            `Legacy region ${province}`,
        );
        const stem = path.posix.basename(
            imagePath,
            path.posix.extname(imagePath),
        );
        if (!/^[a-z0-9]+$/.test(stem)) {
            throw new Error(
                `Legacy region ${province} has an invalid filename`,
            );
        }
        entries.push({
            id: `legacy-region-${stem}`,
            province,
            name: province,
            sourcePath: imagePath,
            stem,
        });
    }
    if (
        entries.length !== provinces.length ||
        new Set(entries.map((item) => item.province)).size !== entries.length ||
        new Set(entries.map((item) => item.id)).size !== entries.length ||
        entries.some((item) => !provinces.includes(item.province))
    ) {
        throw new Error(
            `Legacy Producer Map script must map all ${provinces.length} canonical provinces`,
        );
    }
    return entries;
}

async function readLegacySource(sourceBaseUrl, provinces) {
    const pageUrl = new URL("/producermap.html", sourceBaseUrl);
    const scriptUrl = new URL("/assets/js/map.js", sourceBaseUrl);
    const [page, script] = await Promise.all([
        fetchText(pageUrl, "Legacy Producer Map page"),
        fetchText(scriptUrl, "Legacy Producer Map script"),
    ]);
    const parsedPage = await parseLegacyPage(page.text);
    return {
        sourceBaseUrl,
        page: {
            url: pageUrl.toString(),
            bytes: page.body.byteLength,
            sha256: digest(page.body),
        },
        script: {
            url: scriptUrl.toString(),
            bytes: script.body.byteLength,
            sha256: digest(script.body),
        },
        title: parsedPage.title,
        subtitle: parsedPage.subtitle,
        regions: parseLegacyMapScript(script.text, provinces),
        communities: parsedPage.communities,
    };
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

async function imageDetails(body, label) {
    if (!body.byteLength || body.byteLength > MAX_IMAGE_BYTES) {
        throw new Error(`${label} has an invalid byte size`);
    }
    let metadata;
    try {
        metadata = await sharp(body, {
            animated: true,
            failOn: "error",
            limitInputPixels: 150 * 1000 * 1000,
        }).metadata();
    } catch {
        throw new Error(`${label} is not a decodable image`);
    }
    const format = IMAGE_FORMATS.get(metadata.format);
    if (!format || !metadata.width || !metadata.height) {
        throw new Error(`${label} uses an unsupported image format`);
    }
    return { ...format, width: metadata.width, height: metadata.height };
}

function mediaFilename(kind, item, extension) {
    const stem = kind === "region" ? item.stem : item.id;
    if (
        !["region", "community"].includes(kind) ||
        !/^[a-z0-9-]+$/.test(stem) ||
        !/^[a-z0-9]+$/.test(extension)
    ) {
        throw new Error("Invalid Producer Map media components");
    }
    return `${kind}-${stem}.${extension}`;
}

async function stageSourceMedia(source, staging, producerMapAssetObjectKey) {
    const inputs = [
        ...source.regions.map((item) => ({ kind: "region", item })),
        ...source.communities.map((item) => ({ kind: "community", item })),
    ];
    const mediaDirectory = path.join(staging, "media");
    return mapConcurrent(inputs, 8, async ({ kind, item }, index) => {
        const sourceUrl = new URL(item.sourcePath, source.sourceBaseUrl);
        const response = await fetchWithRetry(
            sourceUrl,
            `Legacy ${kind} ${item.id}`,
        );
        if (!response.ok) {
            throw new Error(
                `Legacy ${kind} ${item.id} returned HTTP ${response.status}`,
            );
        }
        const body = Buffer.from(await response.arrayBuffer());
        const details = await imageDetails(body, `Legacy ${kind} ${item.id}`);
        const filename = mediaFilename(kind, item, details.extension);
        const stagingPath = path.join(mediaDirectory, filename);
        await fs.mkdir(mediaDirectory, { recursive: true });
        const current = await fs.readFile(stagingPath).catch((error) => {
            if (error.code === "ENOENT") return null;
            throw error;
        });
        if (!current || digest(current) !== digest(body)) {
            const temporary = `${stagingPath}.tmp-${process.pid}-${index}`;
            await fs.writeFile(temporary, body, { mode: 0o600 });
            await fs.rename(temporary, stagingPath);
        }
        if ((index + 1) % 10 === 0 || index + 1 === inputs.length) {
            process.stderr.write(
                `Staged ${index + 1}/${inputs.length} Producer Map images\n`,
            );
        }
        return {
            kind,
            id: item.id,
            name: item.name,
            sourcePath: item.sourcePath,
            sourceUrl: sourceUrl.toString(),
            sourceEtag: response.headers.get("etag"),
            sourceLastModified: response.headers.get("last-modified"),
            filename,
            url: `/uploads/producer-map/${filename}`,
            key: producerMapAssetObjectKey(filename),
            stagingPath,
            bytes: body.byteLength,
            sha256: digest(body),
            contentType: details.contentType,
            width: details.width,
            height: details.height,
            body,
        };
    });
}

function legacyImage(current, sourcePathValue, sourceBaseUrl, mediaUrl) {
    if (!current) return true;
    if (current === mediaUrl || current === sourcePathValue) return true;
    return current === new URL(sourcePathValue, sourceBaseUrl).toString();
}

function initialProducerMapContent(source) {
    return {
        version: 1,
        title: source.title,
        subtitle: source.subtitle,
        introduction: source.title,
        directoryTitle: source.title,
        mapSourceLabel: source.sourceBaseUrl,
        mapSourceUrl: source.sourceBaseUrl,
        regions: [],
        communities: [],
        updatedAt: null,
    };
}

function nextProducerMapContent(current, source, media) {
    const mediaBySourcePath = new Map(
        media.map((item) => [item.sourcePath, item]),
    );
    const regions = [...current.regions];
    const communities = [...current.communities];
    let regionsAdded = 0;
    let communitiesAdded = 0;
    let imagesLinked = 0;

    for (const sourceRegion of source.regions) {
        const asset = mediaBySourcePath.get(sourceRegion.sourcePath);
        if (!asset)
            throw new Error(
                `Producer Map media is missing region ${sourceRegion.id}`,
            );
        const index = regions.findIndex(
            (item) => item.province === sourceRegion.province,
        );
        if (index < 0) {
            regions.push({
                id: sourceRegion.id,
                province: sourceRegion.province,
                name: sourceRegion.name,
                summary: "",
                contact: "",
                linkUrl: null,
                imageUrl: asset.url,
                series: "all",
                enabled: true,
            });
            regionsAdded += 1;
            imagesLinked += 1;
        } else if (
            legacyImage(
                regions[index].imageUrl,
                sourceRegion.sourcePath,
                source.sourceBaseUrl,
                asset.url,
            ) &&
            regions[index].imageUrl !== asset.url
        ) {
            regions[index] = { ...regions[index], imageUrl: asset.url };
            imagesLinked += 1;
        }
    }

    for (const sourceCommunity of source.communities) {
        const asset = mediaBySourcePath.get(sourceCommunity.sourcePath);
        if (!asset) {
            throw new Error(
                `Producer Map media is missing community ${sourceCommunity.id}`,
            );
        }
        const index = communities.findIndex(
            (item) => item.name === sourceCommunity.name,
        );
        if (index < 0) {
            communities.push({
                id: sourceCommunity.id,
                name: sourceCommunity.name,
                platform: sourceCommunity.platform,
                region: sourceCommunity.region,
                description: "",
                contact: "",
                linkUrl: null,
                imageUrl: asset.url,
                series: sourceCommunity.series,
                enabled: true,
            });
            communitiesAdded += 1;
            imagesLinked += 1;
        } else if (
            legacyImage(
                communities[index].imageUrl,
                sourceCommunity.sourcePath,
                source.sourceBaseUrl,
                asset.url,
            ) &&
            communities[index].imageUrl !== asset.url
        ) {
            communities[index] = { ...communities[index], imageUrl: asset.url };
            imagesLinked += 1;
        }
    }

    const content = {
        ...current,
        regions,
        communities,
    };
    const comparable = (value) => JSON.stringify({ ...value, updatedAt: null });
    return {
        content,
        changed: comparable(content) !== comparable(current),
        regionsAdded,
        communitiesAdded,
        imagesLinked,
    };
}

async function syncObjects(storage, media, apply) {
    return mapConcurrent(media, 4, async (entry) => {
        const existing = await storage.get(entry.key);
        const matches =
            existing !== null &&
            existing.size === entry.bytes &&
            digest(existing.body) === entry.sha256;
        let objectStatus = "unchanged";
        if (!matches && !apply)
            objectStatus = existing ? "would-replace" : "would-upload";
        else if (!matches) {
            objectStatus = existing ? "replaced" : "uploaded";
            await storage.put(entry.key, entry.body, {
                contentType: entry.contentType,
                sha256: entry.sha256,
                metadata: {
                    source: "legacy-producer-map-import",
                    kind: entry.kind,
                    itemId: entry.id,
                },
            });
        }
        if (apply || matches) {
            const verified = await storage.get(entry.key);
            if (
                !verified ||
                verified.size !== entry.bytes ||
                digest(verified.body) !== entry.sha256
            ) {
                throw new Error(
                    `Producer Map object verification failed: ${entry.key}`,
                );
            }
        }
        return { ...entry, objectStatus };
    });
}

async function syncProducerMapData(
    storage,
    source,
    media,
    apply,
    dependencies,
) {
    const currentObject = await storage.get(dependencies.objectKey);
    const current = currentObject
        ? dependencies.parseContent(currentObject.body)
        : initialProducerMapContent(source);
    const plan = nextProducerMapContent(current, source, media);
    const validated = dependencies.validateDraft(plan.content);
    const syncedMedia = await syncObjects(storage, media, apply);
    let configStatus = plan.changed ? "would-write" : "unchanged";
    if (apply && plan.changed) {
        if (!storage.putIfUnchanged) {
            throw new Error(
                "Producer Map migration requires conditional object writes",
            );
        }
        const content = { ...validated, updatedAt: new Date().toISOString() };
        const stored = await storage.putIfUnchanged(
            dependencies.objectKey,
            currentObject?.etag || null,
            dependencies.serializeContent(content),
            { contentType: "application/json; charset=utf-8" },
        );
        if (!stored)
            throw new Error(
                "Producer Map config changed during migration; retry",
            );
        configStatus = currentObject ? "updated" : "created";
    }
    if (apply || !plan.changed) {
        const verified = await storage.get(dependencies.objectKey);
        if (!verified)
            throw new Error("Producer Map config verification failed");
        const content = dependencies.parseContent(verified.body);
        for (const entry of media) {
            const sourceItem =
                entry.kind === "region"
                    ? source.regions.find(
                          (candidate) =>
                              candidate.sourcePath === entry.sourcePath,
                      )
                    : source.communities.find(
                          (candidate) =>
                              candidate.sourcePath === entry.sourcePath,
                      );
            const item =
                entry.kind === "region"
                    ? content.regions.find(
                          (candidate) =>
                              candidate.province === sourceItem?.province,
                      )
                    : content.communities.find(
                          (candidate) => candidate.name === sourceItem?.name,
                      );
            if (!item)
                throw new Error(
                    `Producer Map config is missing ${entry.kind} ${entry.id}`,
                );
        }
    }
    return { ...plan, configStatus, media: syncedMedia };
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
    const {
        parseNodeObjectStorageConfig,
    } = require("../../src/config/object-storage.ts");
    const storageConfig = parseNodeObjectStorageConfig();
    if (storageConfig.type !== "s3") {
        throw new Error(
            "Legacy Producer Map migration requires IMS_OBJECT_STORAGE=s3",
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
        PRODUCER_MAP_OBJECT_KEY,
        producerMapAssetObjectKey,
    } = require("../../src/utils/storage/business-object-keys.ts");
    const {
        PRODUCER_MAP_PROVINCES,
        parseProducerMapContent,
        serializeProducerMapContent,
        validateProducerMapDraft,
    } = require("../../src/domains/content/producer-map/data.ts");
    const source = await readLegacySource(
        options.sourceBaseUrl,
        PRODUCER_MAP_PROVINCES,
    );
    const media = await stageSourceMedia(
        source,
        options.staging,
        producerMapAssetObjectKey,
    );
    const {
        closeNodeServices,
        resolveNodeServices,
    } = require("../../src/runtime/node-services.ts");
    let services;
    try {
        services = await resolveNodeServices();
        if (!services.storage) throw new Error("Object storage is unavailable");
        const result = await syncProducerMapData(
            services.storage,
            source,
            media,
            options.apply,
            {
                objectKey: PRODUCER_MAP_OBJECT_KEY,
                parseContent: parseProducerMapContent,
                serializeContent: serializeProducerMapContent,
                validateDraft: validateProducerMapDraft,
            },
        );
        if (options.requireR2) validateR2Acceptance(result);
        const report = {
            generatedAt: new Date().toISOString(),
            sourceBaseUrl: options.sourceBaseUrl,
            targetBucket: bucket,
            targetPrefix: process.env.IMS_S3_PREFIX || "",
            apply: options.apply,
            r2Acceptance: options.requireR2,
            page: source.page,
            script: source.script,
            summary: {
                regionCount: source.regions.length,
                communityCount: source.communities.length,
                mediaCount: result.media.length,
                mediaBytes: result.media.reduce(
                    (total, item) => total + item.bytes,
                    0,
                ),
                regionsAdded: result.regionsAdded,
                communitiesAdded: result.communitiesAdded,
                imagesLinked: result.imagesLinked,
                configStatus: result.configStatus,
                objects: countBy(result.media, "objectStatus"),
            },
            regions: source.regions,
            communities: source.communities,
            media: result.media.map(({ body, ...item }) => item),
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
    helpText,
    initialProducerMapContent,
    nextProducerMapContent,
    parseArguments,
    parseLegacyMapScript,
    parseLegacyPage,
    syncProducerMapData,
    validateR2Acceptance,
    validateR2Target,
};
