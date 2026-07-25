import fs from 'node:fs/promises';
import path from 'node:path';
import {
    CopyObjectCommand,
    DeleteObjectsCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    S3Client
} from '@aws-sdk/client-s3';
import pg from 'pg';
import { parseNodeObjectStorageConfig } from '@/config/object-storage';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';
import { protectedPhysicalObjectKey } from '@/utils/storage/object-access-policy';

type StorageScope = 'private' | 'public';

interface Options {
    apply: boolean;
    concurrency: number;
    legacyPrivateBucket: string;
    report: string;
    targetBucket: string;
}

interface LegacyObject {
    byteSize: number;
    etag: string;
    logicalKey: string;
    objectId: string;
    sourceKey: string;
    targetKey: string;
    targetScope: StorageScope;
}

interface ListedObject {
    etag: string;
    key: string;
    size: number;
}

const projectRoot = path.resolve(__dirname, '../../../..');

function requiredValue(argv: string[], index: number, name: string): string {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    return value;
}

function positiveInteger(value: string, name: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 64) {
        throw new Error(`${name} must be an integer between 1 and 64`);
    }
    return parsed;
}

function normalizeEtag(value: string | undefined): string {
    return (value || '').trim().replace(/^"|"$/g, '').toLowerCase();
}

function encodeCopySource(bucket: string, key: string): string {
    return [bucket, ...key.split('/')].map(encodeURIComponent).join('/');
}

export function targetPlacement(
    sourceKey: string,
    configuredPrefix = '',
    protectedAccess = false
): { key: string; scope: StorageScope } {
    return protectedAccess
        ? {
            key: protectedPhysicalObjectKey(sourceKey, configuredPrefix),
            scope: 'private'
        }
        : { key: sourceKey, scope: 'public' };
}

export function parseSingleBucketConsolidationArguments(
    argv: string[],
    environment: NodeJS.ProcessEnv = process.env
): Options {
    const storage = parseNodeObjectStorageConfig(environment);
    if (storage.type !== 's3') throw new Error('IMS_OBJECT_STORAGE=s3 is required');
    let apply = false;
    let concurrency = 16;
    let legacyPrivateBucket = environment.IMS_S3_LEGACY_PRIVATE_BUCKET || '';
    let report = path.join(
        projectRoot,
        'data/migration/single-bucket-consolidation-dry-run.json'
    );
    let confirmedSourceBucket: string | undefined;
    let confirmedTargetBucket: string | undefined;
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--') continue;
        if (argument === '--apply') {
            apply = true;
            report = path.join(
                projectRoot,
                'data/migration/single-bucket-consolidation.json'
            );
        } else if (argument === '--legacy-private-bucket') {
            legacyPrivateBucket = requiredValue(argv, index, argument);
            index += 1;
        } else if (argument === '--concurrency') {
            concurrency = positiveInteger(requiredValue(argv, index, argument), argument);
            index += 1;
        } else if (argument === '--confirm-source-bucket') {
            confirmedSourceBucket = requiredValue(argv, index, argument);
            index += 1;
        } else if (argument === '--confirm-target-bucket') {
            confirmedTargetBucket = requiredValue(argv, index, argument);
            index += 1;
        } else if (argument === '--report') {
            report = path.resolve(projectRoot, requiredValue(argv, index, argument));
            index += 1;
        } else if (argument === '--help' || argument === '-h') {
            console.log([
                'Usage: pnpm run migration:single-bucket -- [options]',
                '',
                'Audits legacy private R2 objects by default. Apply copies them into the',
                'configured single bucket, finalizes PostgreSQL, and deletes source objects.',
                '',
                'Options:',
                '  --apply',
                '  --legacy-private-bucket <bucket>',
                '  --confirm-source-bucket <bucket>',
                '  --confirm-target-bucket <bucket>',
                '  --concurrency <1..64>',
                '  --report <file>'
            ].join('\n'));
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }
    if (!legacyPrivateBucket) throw new Error('--legacy-private-bucket is required');
    if (legacyPrivateBucket === storage.bucket) {
        throw new Error('Legacy private bucket must differ from IMS_S3_BUCKET');
    }
    if (apply && (
        confirmedSourceBucket !== legacyPrivateBucket ||
        confirmedTargetBucket !== storage.bucket
    )) {
        throw new Error(
            `Apply requires --confirm-source-bucket ${legacyPrivateBucket} ` +
            `--confirm-target-bucket ${storage.bucket}`
        );
    }
    return {
        apply,
        concurrency,
        legacyPrivateBucket,
        report,
        targetBucket: storage.bucket
    };
}

async function listObjects(client: S3Client, bucket: string): Promise<ListedObject[]> {
    const objects: ListedObject[] = [];
    let continuationToken: string | undefined;
    do {
        const response = await client.send(new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: continuationToken
        }));
        for (const object of response.Contents || []) {
            if (!object.Key) continue;
            objects.push({
                etag: normalizeEtag(object.ETag),
                key: object.Key,
                size: Number(object.Size || 0)
            });
        }
        continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    return objects.sort((left, right) => left.key.localeCompare(right.key));
}

async function loadLegacyObjects(
    connectionString: string,
    configuredPrefix: string
): Promise<LegacyObject[]> {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
        const result = await client.query<{
            byte_size: string;
            etag: string;
            logical_key: string;
            object_id: string;
            physical_key: string;
            state: 'pending' | 'ready';
        }>(
            `SELECT i.logical_key, i.state, v.object_id, v.physical_key, v.byte_size, v.etag
             FROM s3_object_index AS i
             JOIN s3_object_versions AS v ON v.object_id=i.object_id
             WHERE i.state IN ('pending', 'ready')
               AND v.storage_scope='private'
               AND v.physical_key IS NOT NULL
             ORDER BY v.physical_key`
        );
        const pendingCards = await client.query<{
            image1_url: string;
            image2_url: string;
        }>("SELECT image1_url, image2_url FROM cards WHERE status='pending'");
        const pendingNamecardKeys = new Set(pendingCards.rows.flatMap((card) => [
            publicMediaObjectKey(card.image1_url),
            publicMediaObjectKey(card.image2_url)
        ]));
        const protectedMarker = configuredPrefix
            ? `${configuredPrefix}/__protected/`
            : '__protected/';
        return result.rows
            .filter((row) => !row.physical_key.startsWith(protectedMarker))
            .map((row) => {
                const target = targetPlacement(
                    row.physical_key,
                    configuredPrefix,
                    row.state === 'pending' || pendingNamecardKeys.has(row.logical_key)
                );
                return {
                    byteSize: Number(row.byte_size),
                    etag: normalizeEtag(row.etag),
                    logicalKey: row.logical_key,
                    objectId: row.object_id,
                    sourceKey: row.physical_key,
                    targetKey: target.key,
                    targetScope: target.scope
                };
            });
    } finally {
        await client.end();
    }
}

function assertExactSourceInventory(
    databaseObjects: LegacyObject[],
    sourceObjects: ListedObject[]
): void {
    const expected = new Map(databaseObjects.map((object) => [object.sourceKey, object]));
    const actual = new Map(sourceObjects.map((object) => [object.key, object]));
    const missing = databaseObjects.filter((object) => !actual.has(object.sourceKey));
    const orphaned = sourceObjects.filter((object) => !expected.has(object.key));
    const mismatched = databaseObjects.filter((object) => {
        const source = actual.get(object.sourceKey);
        return source && (
            source.size !== object.byteSize ||
            normalizeEtag(source.etag) !== object.etag
        );
    });
    if (missing.length || orphaned.length || mismatched.length) {
        throw new Error(JSON.stringify({
            missing: missing.slice(0, 20).map((object) => object.sourceKey),
            orphaned: orphaned.slice(0, 20).map((object) => object.key),
            mismatched: mismatched.slice(0, 20).map((object) => object.sourceKey)
        }));
    }
}

async function runWorkers<T>(
    entries: T[],
    concurrency: number,
    worker: (entry: T) => Promise<void>
): Promise<void> {
    let next = 0;
    await Promise.all(Array.from(
        { length: Math.min(concurrency, entries.length) },
        async () => {
            while (next < entries.length) {
                const entry = entries[next];
                next += 1;
                await worker(entry);
            }
        }
    ));
}

async function targetMatches(
    client: S3Client,
    bucket: string,
    object: LegacyObject
): Promise<boolean> {
    try {
        const head = await client.send(new HeadObjectCommand({
            Bucket: bucket,
            Key: object.targetKey
        }));
        return Number(head.ContentLength || 0) === object.byteSize &&
            normalizeEtag(head.ETag) === object.etag;
    } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } })
            ?.$metadata?.httpStatusCode;
        if (status === 404) return false;
        throw error;
    }
}

async function finalizeDatabase(
    connectionString: string,
    objects: LegacyObject[]
): Promise<{ operationsUpdated: number; versionsUpdated: number }> {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('imsweb-single-bucket'))");
        const active = await client.query<{ uploads: string; compensations: string }>(
            `SELECT
                (SELECT count(*) FROM s3_upload_operations
                 WHERE state IN ('uploading', 'pending')) AS uploads,
                (SELECT count(*) FROM s3_compensation_jobs
                 WHERE state <> 'completed') AS compensations`
        );
        if (
            Number(active.rows[0]?.uploads || 0) !== 0 ||
            Number(active.rows[0]?.compensations || 0) !== 0
        ) {
            throw new Error('Database finalization requires no active uploads or compensations');
        }
        const values = [
            objects.map((object) => object.objectId),
            objects.map((object) => object.sourceKey),
            objects.map((object) => object.targetKey),
            objects.map((object) => object.targetScope)
        ];
        const versions = await client.query(
            `UPDATE s3_object_versions AS target
             SET physical_key=mapping.target_key,
                 storage_scope=mapping.target_scope
             FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
                  AS mapping(object_id, source_key, target_key, target_scope)
             WHERE target.object_id=mapping.object_id
               AND target.physical_key=mapping.source_key`,
            values
        );
        if (versions.rowCount !== objects.length) {
            throw new Error(
                `Updated ${versions.rowCount || 0}/${objects.length} object versions`
            );
        }
        const operations = await client.query(
            `UPDATE s3_upload_operations AS target
             SET physical_key=mapping.target_key,
                 storage_scope=mapping.target_scope
             FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
                  AS mapping(object_id, source_key, target_key, target_scope)
             WHERE target.object_id=mapping.object_id
               AND target.physical_key=mapping.source_key`,
            values
        );
        await client.query('COMMIT');
        return {
            operationsUpdated: operations.rowCount || 0,
            versionsUpdated: versions.rowCount || 0
        };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        await client.end();
    }
}

async function deleteSourceObjects(
    client: S3Client,
    bucket: string,
    objects: LegacyObject[]
): Promise<string[]> {
    const errors: string[] = [];
    for (let index = 0; index < objects.length; index += 1000) {
        const batch = objects.slice(index, index + 1000);
        const result = await client.send(new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
                Objects: batch.map((object) => ({ Key: object.sourceKey })),
                Quiet: true
            }
        }));
        errors.push(...(result.Errors || []).map((error) =>
            `${error.Key || 'unknown'}: ${error.Message || error.Code || 'delete failed'}`
        ));
    }
    return errors;
}

async function writeReport(file: string, report: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
    const options = parseSingleBucketConsolidationArguments(process.argv.slice(2));
    const storage = parseNodeObjectStorageConfig(process.env);
    if (storage.type !== 's3') throw new Error('IMS_OBJECT_STORAGE=s3 is required');
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    const client = new S3Client({
        endpoint: storage.endpoint,
        forcePathStyle: storage.forcePathStyle,
        region: storage.region
    });
    try {
        const [databaseObjects, sourceObjects] = await Promise.all([
            loadLegacyObjects(connectionString, storage.prefix),
            listObjects(client, options.legacyPrivateBucket)
        ]);
        assertExactSourceInventory(databaseObjects, sourceObjects);
        const counts = {
            protected: databaseObjects.filter((object) => object.targetScope === 'private').length,
            public: databaseObjects.filter((object) => object.targetScope === 'public').length,
            total: databaseObjects.length
        };
        const bytes = databaseObjects.reduce((total, object) => total + object.byteSize, 0);
        if (!options.apply) {
            const report = {
                applied: false,
                bytes,
                counts,
                generatedAt: new Date().toISOString(),
                sourceBucket: options.legacyPrivateBucket,
                targetBucket: options.targetBucket
            };
            await writeReport(options.report, report);
            console.log(JSON.stringify(report, null, 2));
            return;
        }

        const copyErrors: Array<{ key: string; message: string }> = [];
        let copied = 0;
        let skipped = 0;
        await runWorkers(databaseObjects, options.concurrency, async (object) => {
            try {
                if (await targetMatches(client, options.targetBucket, object)) {
                    skipped += 1;
                    return;
                }
                const result = await client.send(new CopyObjectCommand({
                    Bucket: options.targetBucket,
                    CopySource: encodeCopySource(
                        options.legacyPrivateBucket,
                        object.sourceKey
                    ),
                    Key: object.targetKey,
                    MetadataDirective: 'COPY'
                }));
                if (
                    normalizeEtag(result.CopyObjectResult?.ETag) !== object.etag ||
                    !await targetMatches(client, options.targetBucket, object)
                ) {
                    throw new Error('Copied object does not match PostgreSQL metadata');
                }
                copied += 1;
            } catch (error) {
                copyErrors.push({
                    key: object.sourceKey,
                    message: error instanceof Error ? error.message : String(error)
                });
            }
        });
        if (copyErrors.length) {
            throw new Error(`Failed to copy ${copyErrors.length} object(s)`);
        }
        const database = await finalizeDatabase(connectionString, databaseObjects);
        const deleteErrors = await deleteSourceObjects(
            client,
            options.legacyPrivateBucket,
            databaseObjects
        );
        const remainingSource = await listObjects(client, options.legacyPrivateBucket);
        const report = {
            applied: true,
            bytes,
            copied,
            counts,
            database,
            deleteErrors,
            finishedAt: new Date().toISOString(),
            remainingSourceObjects: remainingSource.length,
            skipped,
            sourceBucket: options.legacyPrivateBucket,
            targetBucket: options.targetBucket
        };
        await writeReport(options.report, report);
        console.log(JSON.stringify(report, null, 2));
        if (deleteErrors.length || remainingSource.length) process.exitCode = 1;
    } finally {
        client.destroy();
    }
}

if (require.main === module) {
    void main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
