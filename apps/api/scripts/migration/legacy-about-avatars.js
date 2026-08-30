'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { S3Client } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sharp = require('sharp');
const { publicUploadsPath } = require('@imsweb/contracts/paths');
const {
    isAboutMemberAvatarUrl,
    parseAboutPageContent,
    serializeAboutPageContent,
    validateAboutPageDraft
} = require('../../src/domains/content/about/data.ts');
const { safeUploadBaseName } = require('../../src/utils/media/filename.ts');
const {
    ABOUT_PAGE_OBJECT_KEY,
    aboutMemberAvatarObjectKey,
    publicMediaObjectKey
} = require('../../src/utils/storage/business-object-keys.ts');

const DEFAULT_SOURCE = 'https://idol-master.top';
const LEGACY_AVATAR_PREFIX = '/brand/about/staff/';
const LEGACY_AVATAR_FILENAME_PATTERN = /^[a-z0-9._-]+$/i;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_FORMATS = new Set(['avif', 'gif', 'jpeg', 'png', 'webp']);

function sha256(body) {
    return crypto.createHash('sha256').update(body).digest('hex');
}

function normalizedBaseUrl(value) {
    let parsed;
    try {
        parsed = new URL(value);
    } catch (error) {
        throw new Error(`--source-base-url is not a valid URL: ${value}`, {
            cause: error
        });
    }
    if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
    ) {
        throw new Error(
            '--source-base-url must be an HTTP(S) URL without credentials, query, or hash'
        );
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString().replace(/\/$/, '');
}

function parseArguments(argv, environment = process.env) {
    const projectRoot = path.resolve(__dirname, '../../../..');
    const defaultPlan = path.join(
        projectRoot,
        'data/migration/about-avatar-migration.json'
    );
    const defaultResult = path.join(
        projectRoot,
        'data/migration/about-avatar-apply.json'
    );
    const options = {
        sourceBaseUrl: normalizedBaseUrl(
            environment.IMS_LEGACY_ABOUT_MEDIA_BASE_URL || DEFAULT_SOURCE
        ),
        manifest: defaultPlan,
        plan: '',
        apply: false,
        confirmSource: '',
        confirmBucket: '',
        help: false
    };
    let manifestExplicit = false;
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--') continue;
        const next = () => {
            const value = argv[++index];
            if (!value || value.startsWith('--')) {
                throw new Error(`${argument} requires a value`);
            }
            return value;
        };
        if (argument === '--source-base-url') {
            options.sourceBaseUrl = normalizedBaseUrl(next());
        } else if (argument === '--manifest') {
            options.manifest = path.resolve(projectRoot, next());
            manifestExplicit = true;
        } else if (argument === '--plan') {
            options.plan = path.resolve(projectRoot, next());
        } else if (argument === '--apply') {
            options.apply = true;
        } else if (argument === '--confirm-source') {
            options.confirmSource = normalizedBaseUrl(next());
        } else if (argument === '--confirm-bucket') {
            options.confirmBucket = next();
        } else if (argument === '--help' || argument === '-h') {
            options.help = true;
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }
    if (options.apply && !options.plan && !options.help) {
        throw new Error('--apply requires --plan <file>');
    }
    if (options.apply && !manifestExplicit) options.manifest = defaultResult;
    options.manifest = path.resolve(projectRoot, options.manifest);
    if (options.plan && options.plan === options.manifest) {
        throw new Error('--plan and --manifest must use different files');
    }
    return options;
}

function helpText() {
    return [
        'Usage: pnpm run media:about-avatars:sync -- [options]',
        '',
        'Moves legacy About member avatars to the same /uploads path and object-key',
        'format used by new avatar uploads. The command is read-only unless --apply',
        'is provided.',
        '',
        'Options:',
        `  --source-base-url <url>  Public site that serves old avatars (default: ${DEFAULT_SOURCE})`,
        '  --manifest <file>        JSON plan or apply-result report path',
        '  --plan <file>            Reviewed dry-run plan required by --apply',
        '  --apply                  Upload avatars and conditionally update About config',
        '  --confirm-source <url>   Required exact source confirmation with --apply',
        '  --confirm-bucket <name>  Required exact IMS_S3_BUCKET confirmation with --apply',
        '  --help                   Show this help'
    ].join('\n');
}

function classifyAvatarUrl(value, sourceBaseUrl) {
    if (isAboutMemberAvatarUrl(value)) {
        return { kind: 'canonical', url: value };
    }

    let parsed;
    try {
        parsed = value.startsWith('/') && !value.startsWith('//')
            ? new URL(value, `${sourceBaseUrl}/`)
            : new URL(value);
    } catch {
        return { kind: 'unsupported', reason: 'invalid URL' };
    }
    let source;
    try {
        source = new URL(sourceBaseUrl);
    } catch {
        return { kind: 'unsupported', reason: 'source origin is invalid' };
    }
    if (
        parsed.origin !== source.origin ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
    ) {
        return {
            kind: 'unsupported',
            reason: 'avatar is not a query-free URL on the confirmed source origin'
        };
    }
    if (isAboutMemberAvatarUrl(parsed.pathname)) {
        return { kind: 'canonicalized', url: parsed.pathname };
    }
    if (!parsed.pathname.startsWith(LEGACY_AVATAR_PREFIX)) {
        return {
            kind: 'unsupported',
            reason: `source path is outside ${LEGACY_AVATAR_PREFIX}`
        };
    }
    let filename;
    try {
        filename = decodeURIComponent(
            parsed.pathname.slice(LEGACY_AVATAR_PREFIX.length)
        );
    } catch {
        return { kind: 'unsupported', reason: 'legacy avatar filename is invalid' };
    }
    if (
        !filename ||
        !LEGACY_AVATAR_FILENAME_PATTERN.test(filename) ||
        filename === '.' ||
        filename === '..'
    ) {
        return { kind: 'unsupported', reason: 'legacy avatar filename is invalid' };
    }
    return {
        kind: 'legacy',
        sourcePath: parsed.pathname,
        sourceUrl: parsed.toString()
    };
}

async function readBoundedBody(response, label) {
    if (!response.body) throw new Error(`${label} returned an empty response`);
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
        const body = Buffer.from(chunk);
        total += body.byteLength;
        if (total > MAX_IMAGE_BYTES) {
            throw new Error(`${label} exceeds the 10MB image limit`);
        }
        chunks.push(body);
    }
    if (total === 0) throw new Error(`${label} returned an empty response`);
    return Buffer.concat(chunks, total);
}

async function fetchWithRetry(url, label) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'IMSWeb About avatar migration/1.0' },
                redirect: 'error',
                signal: AbortSignal.timeout(30_000)
            });
            if (!response.ok) {
                throw new Error(`${label} returned HTTP ${response.status}`);
            }
            const declaredHeader = response.headers.get('content-length');
            const declaredSize = declaredHeader === null
                ? null
                : Number(declaredHeader);
            if (
                declaredSize !== null &&
                Number.isFinite(declaredSize) &&
                declaredSize > MAX_IMAGE_BYTES
            ) {
                throw new Error(`${label} exceeds the 10MB image limit`);
            }
            return await readBoundedBody(response, label);
        } catch (error) {
            lastError = error;
            if (attempt < 3) {
                await new Promise((resolve) => setTimeout(resolve, attempt * 250));
            }
        }
    }
    throw new Error(`Failed to fetch ${label}`, { cause: lastError });
}

async function toCanonicalWebp(body, label) {
    let metadata;
    try {
        metadata = await sharp(body, {
            animated: false,
            limitInputPixels: 40_000_000
        }).metadata();
    } catch (error) {
        throw new Error(`${label} is not a readable image`, { cause: error });
    }
    if (!metadata.format || !SUPPORTED_IMAGE_FORMATS.has(metadata.format)) {
        throw new Error(`${label} uses an unsupported image format`);
    }
    if (metadata.format === 'webp') return Buffer.from(body);
    const converted = await sharp(body, {
        animated: false,
        limitInputPixels: 40_000_000
    }).webp({ quality: 88 }).toBuffer();
    if (converted.byteLength > MAX_IMAGE_BYTES) {
        throw new Error(`${label} exceeds the 10MB image limit after conversion`);
    }
    return converted;
}

async function stageAboutAvatarPlan(
    content,
    sourceBaseUrl,
    dependencies = {}
) {
    const loadAvatar = dependencies.loadAvatar || (async (sourceUrl, label) =>
        toCanonicalWebp(await fetchWithRetry(sourceUrl, label), label));
    const sourceCache = new Map();
    const migrations = [];
    const canonicalizedUrls = [];
    const unsupported = [];
    const canonicalUrls = [];
    const groups = [];

    for (const group of content.groups) {
        const people = [];
        for (const person of group.people) {
            const currentUrl = person.avatarUrl;
            if (currentUrl === null) {
                people.push(person);
                continue;
            }
            const reference = classifyAvatarUrl(currentUrl, sourceBaseUrl);
            if (reference.kind === 'canonical') {
                canonicalUrls.push(reference.url);
                people.push(person);
                continue;
            }
            if (reference.kind === 'canonicalized') {
                canonicalUrls.push(reference.url);
                canonicalizedUrls.push({
                    groupId: group.id,
                    personId: person.id,
                    from: currentUrl,
                    to: reference.url
                });
                people.push({ ...person, avatarUrl: reference.url });
                continue;
            }
            if (reference.kind === 'unsupported') {
                unsupported.push({
                    groupId: group.id,
                    personId: person.id,
                    url: currentUrl,
                    reason: reference.reason
                });
                people.push(person);
                continue;
            }

            let webpPromise = sourceCache.get(reference.sourceUrl);
            if (!webpPromise) {
                webpPromise = Promise.resolve(loadAvatar(
                    reference.sourceUrl,
                    `About avatar ${person.id}`
                )).then((body) => Buffer.from(body));
                sourceCache.set(reference.sourceUrl, webpPromise);
            }
            const body = await webpPromise;
            const hash = sha256(body);
            const filename = `${safeUploadBaseName(person.id)}-${hash.slice(0, 12)}.webp`;
            const targetUrl = publicUploadsPath(
                `/about/member-avatars/${filename}`
            );
            const migration = {
                groupId: group.id,
                personId: person.id,
                from: currentUrl,
                sourceUrl: reference.sourceUrl,
                to: targetUrl,
                key: aboutMemberAvatarObjectKey(filename),
                bytes: body.byteLength,
                sha256: hash,
                body
            };
            migrations.push(migration);
            canonicalUrls.push(targetUrl);
            people.push({ ...person, avatarUrl: targetUrl });
        }
        groups.push({ ...group, people });
    }

    return {
        content: { ...content, groups },
        migrations,
        canonicalizedUrls,
        unsupported,
        canonicalUrls: [...new Set(canonicalUrls)]
    };
}

async function inspectCanonicalObjects(storage, urls, migrationKeys) {
    const results = [];
    for (const url of urls) {
        const key = publicMediaObjectKey(url);
        if (migrationKeys.has(key)) continue;
        const object = await storage.get(key);
        results.push({
            url,
            key,
            status: object ? 'present' : 'missing',
            ...(object ? { bytes: object.size } : {})
        });
    }
    return results;
}

function migrationPlanEntry(item) {
    return {
        groupId: item.groupId,
        personId: item.personId,
        from: item.from,
        sourceUrl: item.sourceUrl,
        to: item.to,
        key: item.key,
        bytes: item.bytes,
        sha256: item.sha256
    };
}

function sortedPlanEntries(items, key) {
    return [...items].sort((left, right) =>
        String(left[key]).localeCompare(String(right[key]))
    );
}

function approvedPlanView(sourceBaseUrl, sourceRevision, plan) {
    const migrationsByKey = new Map();
    for (const migration of plan.migrations) {
        if (!migrationsByKey.has(migration.key)) {
            migrationsByKey.set(migration.key, migrationPlanEntry(migration));
        }
    }
    return {
        sourceBaseUrl,
        sourceRevision,
        migrations: sortedPlanEntries([...migrationsByKey.values()], 'key'),
        canonicalizedUrls: sortedPlanEntries(
            plan.canonicalizedUrls.map((item) => ({
                groupId: item.groupId,
                personId: item.personId,
                from: item.from,
                to: item.to
            })),
            'personId'
        ),
        unsupported: sortedPlanEntries(plan.unsupported, 'personId')
    };
}

function assertApprovedPlan(expected, sourceBaseUrl, sourceRevision, plan) {
    if (!expected || expected.apply !== false) {
        throw new Error('About avatar apply requires a reviewed dry-run plan');
    }
    const expectedView = approvedPlanView(
        expected.sourceBaseUrl,
        expected.sourceRevision,
        expected
    );
    const currentView = approvedPlanView(sourceBaseUrl, sourceRevision, plan);
    if (JSON.stringify(expectedView) !== JSON.stringify(currentView)) {
        throw new Error(
            'About avatar source or config does not match the approved plan; run a new dry-run'
        );
    }
}

async function syncMigrationObjects(storage, migrations, apply) {
    const unique = new Map();
    for (const migration of migrations) {
        const existing = unique.get(migration.key);
        if (existing && existing.sha256 !== migration.sha256) {
            throw new Error(`Conflicting About avatar target: ${migration.key}`);
        }
        if (!existing) unique.set(migration.key, migration);
    }

    const results = [];
    for (const migration of unique.values()) {
        const existing = await storage.get(migration.key);
        const matches = existing !== null &&
            existing.size === migration.bytes &&
            sha256(existing.body) === migration.sha256;
        if (existing && !matches) {
            throw new Error(
                `About avatar target exists with different content: ${migration.key}`
            );
        }
        let status = matches ? 'unchanged' : 'would-upload';
        if (!matches && apply) {
            status = 'uploaded';
            await storage.put(migration.key, migration.body, {
                contentType: 'image/webp',
                sha256: migration.sha256,
                metadata: {
                    kind: 'about-member-avatar',
                    source: 'legacy-about-avatar-migration'
                }
            });
        }
        if (apply || matches) {
            const verified = await storage.get(migration.key);
            if (
                !verified ||
                verified.size !== migration.bytes ||
                sha256(verified.body) !== migration.sha256
            ) {
                throw new Error(
                    `About avatar object verification failed: ${migration.key}`
                );
            }
        }
        const { body: _body, ...report } = migration;
        results.push({ ...report, status });
    }
    return results;
}

async function rollbackUploadedObjects(
    storage,
    migratedObjects,
    objectKey,
    parseContent
) {
    const currentObject = await storage.get(objectKey);
    if (!currentObject) {
        throw new Error(
            'About avatar config changed and rollback safety could not be determined'
        );
    }
    let referencedUrls;
    try {
        const current = parseContent(currentObject.body);
        referencedUrls = new Set(current.groups.flatMap((group) =>
            group.people.map((person) => person.avatarUrl).filter(Boolean)
        ));
    } catch (error) {
        throw new Error(
            'About avatar config changed and rollback safety could not be determined',
            { cause: error }
        );
    }
    const failures = [];
    for (const migration of migratedObjects) {
        if (
            migration.status !== 'uploaded' ||
            referencedUrls.has(migration.to)
        ) {
            continue;
        }
        try {
            await storage.delete(migration.key);
        } catch (error) {
            failures.push({ key: migration.key, error });
        }
    }
    if (failures.length > 0) {
        throw new Error(
            `About avatar config changed and ${failures.length} uploaded object(s) could not be rolled back`,
            { cause: failures[0].error }
        );
    }
}

async function syncAboutAvatars(
    storage,
    sourceBaseUrl,
    apply,
    dependencies = {}
) {
    const objectKey = dependencies.objectKey || ABOUT_PAGE_OBJECT_KEY;
    const parseContent = dependencies.parseContent || parseAboutPageContent;
    const serializeContent = dependencies.serializeContent ||
        serializeAboutPageContent;
    const validateDraft = dependencies.validateDraft || validateAboutPageDraft;
    const currentObject = await storage.get(objectKey);
    if (!currentObject) throw new Error('About page config is not configured');
    const current = parseContent(currentObject.body);
    const plan = await stageAboutAvatarPlan(
        current,
        sourceBaseUrl,
        dependencies
    );
    const migrationKeys = new Set(plan.migrations.map((item) => item.key));
    const canonicalObjects = await inspectCanonicalObjects(
        storage,
        plan.canonicalUrls,
        migrationKeys
    );
    const missingObjects = canonicalObjects.filter(
        (item) => item.status === 'missing'
    );
    const changed = plan.migrations.length > 0 ||
        plan.canonicalizedUrls.length > 0;
    const blocked = plan.unsupported.length > 0 || missingObjects.length > 0;
    if (apply) {
        assertApprovedPlan(
            dependencies.expectedPlan,
            sourceBaseUrl,
            currentObject.etag,
            plan
        );
    }
    if (apply && plan.unsupported.length > 0) {
        throw new Error(
            `About avatar migration has ${plan.unsupported.length} unsupported URL(s)`
        );
    }
    if (apply && missingObjects.length > 0) {
        throw new Error(
            `About avatar migration found ${missingObjects.length} missing uploaded object(s)`
        );
    }
    const nextContent = apply && changed
        ? {
            ...validateDraft(plan.content),
            updatedAt: new Date().toISOString()
        }
        : null;
    const migratedObjects = await syncMigrationObjects(
        storage,
        plan.migrations,
        apply
    );
    let configStatus = blocked
        ? 'blocked'
        : changed
            ? 'would-update'
            : 'unchanged';

    if (apply && changed) {
        if (!storage.putIfUnchanged) {
            throw new Error(
                'About avatar migration requires conditional object writes'
            );
        }
        const stored = await storage.putIfUnchanged(
            objectKey,
            currentObject.etag,
            serializeContent(nextContent),
            { contentType: 'application/json; charset=utf-8' }
        );
        if (!stored) {
            await rollbackUploadedObjects(
                storage,
                migratedObjects,
                objectKey,
                parseContent
            );
            throw new Error('About page config changed during migration; retry');
        }
        configStatus = 'updated';
    }

    if (apply || (!changed && !blocked)) {
        const verified = await storage.get(objectKey);
        if (!verified) throw new Error('About page config verification failed');
        const verifiedContent = parseContent(verified.body);
        for (const group of verifiedContent.groups) {
            for (const person of group.people) {
                if (
                    person.avatarUrl !== null &&
                    !isAboutMemberAvatarUrl(person.avatarUrl)
                ) {
                    throw new Error(
                        `About avatar config verification failed: ${person.id}`
                    );
                }
            }
        }
    }

    return {
        sourceBaseUrl,
        sourceRevision: currentObject.etag,
        apply,
        configStatus,
        migrations: migratedObjects,
        canonicalizedUrls: plan.canonicalizedUrls,
        unsupported: plan.unsupported,
        canonicalObjects,
        summary: {
            avatarCount: plan.canonicalUrls.length,
            migrated: plan.migrations.length,
            canonicalized: plan.canonicalizedUrls.length,
            unsupported: plan.unsupported.length,
            missingObjects: missingObjects.length,
            objectStatuses: Object.fromEntries(
                [...new Set(migratedObjects.map((item) => item.status))]
                    .sort()
                    .map((status) => [
                        status,
                        migratedObjects.filter((item) => item.status === status)
                            .length
                    ])
            )
        }
    };
}

async function writeManifest(target, report) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}`;
    await fs.writeFile(temporary, `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        ...report
    }, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, target);
}

async function readApprovedPlan(target) {
    let value;
    try {
        value = JSON.parse(await fs.readFile(target, 'utf8'));
    } catch (error) {
        throw new Error(`Failed to read approved plan: ${target}`, {
            cause: error
        });
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Approved plan is invalid: ${target}`);
    }
    return value;
}

async function createMigrationStorage(storageConfig) {
    const { parseNodeDatabaseConfig } = require('../../src/config/database.ts');
    const {
        PostgresConnection
    } = require('../../src/infra/db/postgresql/connection.ts');
    const {
        S3CompensationService
    } = require('../../src/infra/oss/s3/compensation-service.ts');
    const {
        S3ObjectStorage
    } = require('../../src/infra/oss/s3/object-storage.ts');
    const {
        S3UploadStateMachine
    } = require('../../src/infra/oss/s3/upload-state-machine.ts');
    const database = PostgresConnection.create(
        parseNodeDatabaseConfig(process.env)
    );
    const client = new S3Client({
        region: storageConfig.region,
        endpoint: storageConfig.endpoint,
        forcePathStyle: storageConfig.forcePathStyle
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
            storage.deletePhysicalObject(objectId, physicalKey, storageScope)
    );
    storage = new S3ObjectStorage(
        client,
        {
            bucket: storageConfig.bucket,
            publicReadUrlBase: storageConfig.publicReadUrlBase,
            prefix: storageConfig.prefix,
            readUrlTtlSeconds: storageConfig.readUrlTtlSeconds
        },
        (command, expiresIn) => getSignedUrl(client, command, { expiresIn }),
        state,
        compensation
    );
    return {
        storage,
        async close() {
            storage.close();
            await database.close();
        }
    };
}

async function main() {
    require('../../src/config/load-environment.ts');
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(`${helpText()}\n`);
        return;
    }
    const bucket = process.env.IMS_S3_BUCKET?.trim() || '';
    if (options.apply && options.confirmSource !== options.sourceBaseUrl) {
        throw new Error(
            `Apply requires --confirm-source ${options.sourceBaseUrl}`
        );
    }
    if (options.apply && (!bucket || options.confirmBucket !== bucket)) {
        throw new Error(
            `Apply requires --confirm-bucket ${bucket || '<IMS_S3_BUCKET>'}`
        );
    }
    const {
        parseNodeObjectStorageConfig
    } = require('../../src/config/object-storage.ts');
    const storageConfig = parseNodeObjectStorageConfig();
    if (storageConfig.type !== 's3') {
        throw new Error(
            'About avatar migration requires IMS_OBJECT_STORAGE=s3'
        );
    }
    const targetPrefix = storageConfig.prefix;
    const approvedPlan = options.apply
        ? await readApprovedPlan(options.plan)
        : null;
    if (approvedPlan) {
        if (
            approvedPlan.targetBucket !== bucket ||
            approvedPlan.targetPrefix !== targetPrefix ||
            approvedPlan.sourceBaseUrl !== options.sourceBaseUrl ||
            approvedPlan.apply !== false
        ) {
            throw new Error(
                'Approved plan does not match the confirmed source and storage target'
            );
        }
        if (
            approvedPlan.configStatus === 'blocked' ||
            approvedPlan.summary?.unsupported !== 0 ||
            approvedPlan.summary?.missingObjects !== 0
        ) {
            throw new Error('Approved plan is blocked and cannot be applied');
        }
    }
    let storageHandle;
    try {
        storageHandle = await createMigrationStorage(storageConfig);
        const report = await syncAboutAvatars(
            storageHandle.storage,
            options.sourceBaseUrl,
            options.apply,
            { expectedPlan: approvedPlan }
        );
        await writeManifest(options.manifest, {
            targetBucket: bucket,
            targetPrefix,
            ...report
        });
        process.stdout.write(`${JSON.stringify({
            manifest: options.manifest,
            plan: options.plan || null,
            apply: options.apply,
            configStatus: report.configStatus,
            ...report.summary
        }, null, 2)}\n`);
    } finally {
        if (storageHandle) await storageHandle.close();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    classifyAvatarUrl,
    createMigrationStorage,
    helpText,
    parseArguments,
    readBoundedBody,
    stageAboutAvatarPlan,
    syncAboutAvatars
};
