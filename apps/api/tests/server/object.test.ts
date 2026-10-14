// Merged from 5 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import { createPostgresTestDatabase, postgresTest } from '../postgres-test-database';
import { PostgresqlObjectDeletionWorker } from '@/infra/db/postgresql/object-deletion-worker';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import { queryOne } from '@/infra/db/sql/query';
import { shutdownServer } from '@/main';
import type { CompensationService, ObjectCleanupRunner, ObjectDeletionWorker, ObjectReadUrlOptions, ObjectStorage } from '@/ports/object-storage';
import type { RuntimeServices } from '@/ports/runtime-services';
import { NodeObjectCleanupRunner } from '@/runtime/node-object-cleanup-runner';
import { createNodeServiceLifecycle } from '@/runtime/node-services';
import { objectReadResponse } from '@/utils/http/object-read-response';
import { protectObjectWithCompensation } from '@/utils/storage/delete-object';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { describe, onTestFinished, test } from 'vitest';

// object-cleanup-lifecycle.test.ts
{
    function signal(): { promise: Promise<void>; resolve: () => void } {
        let resolve!: () => void;
        return {
            promise: new Promise<void>((settle) => {
                resolve = settle;
            }),
            resolve: () => resolve(),
        };
    }

    test.describe('object cleanup lifecycle', () => {
        test("object cleanup runner stops scheduling and closes only after the active cycle is idle", async () => {
            const started = signal();
            const release = signal();
            const calls: string[] = [];
            const limits: number[] = [];
            const objectDeletions: ObjectDeletionWorker = {
                async run(limit) {
                    calls.push("deletions");
                    limits.push(limit ?? -1);
                    started.resolve();
                    await release.promise;
                },
                async retryQuarantined() {
                    return false;
                },
            };
            const compensation: CompensationService = {
                async enqueue() {
                    return "unused";
                },
                async run(_storage, limit) {
                    calls.push("compensation");
                    limits.push(limit ?? -1);
                },
            };
            const runner = new NodeObjectCleanupRunner(
                objectDeletions,
                compensation,
                {} as ObjectStorage,
                {
                    intervalMs: 60_000,
                    batchSize: 7,
                    onError(error) {
                        assert.fail(`unexpected cleanup error: ${String(error)}`);
                    },
                },
            );
            onTestFinished(() => runner.close());

            runner.start();
            await started.promise;
            assert.equal(runner.isIdle(), false);
            let closed = false;
            const closing = runner.close().then(() => {
                closed = true;
            });
            await Promise.resolve();
            assert.equal(closed, false, "close must wait for the active cleanup cycle");

            release.resolve();
            await closing;
            assert.equal(runner.isIdle(), true);
            assert.deepEqual(calls, ["deletions", "compensation"]);
            assert.deepEqual(limits, [7, 7]);
            await runner.run();
            assert.deepEqual(calls, ["deletions", "compensation"]);
        });

        test("Node service shutdown waits for object cleanup before closing its dependencies", async () => {
            const cleanupStarted = signal();
            const releaseCleanup = signal();
            const calls: string[] = [];
            let idle = false;
            const objectCleanup: ObjectCleanupRunner = {
                start() {},
                async run() {},
                async close() {
                    calls.push("cleanup:start");
                    cleanupStarted.resolve();
                    await releaseCleanup.promise;
                    idle = true;
                    calls.push("cleanup:idle");
                },
                isIdle() {
                    return idle;
                },
            };
            const lifecycle = createNodeServiceLifecycle(
                async () =>
                    ({
                        objectCleanup,
                        storage: {
                            close() {
                                assert.equal(objectCleanup.isIdle(), true);
                                calls.push("storage:close");
                            },
                        },
                    }) as unknown as RuntimeServices,
            );

            await lifecycle.resolve();
            const server = createServer((_request, response) => response.end("ok"));
            server.listen(0, "127.0.0.1");
            await once(server, "listening");
            let shutdownCompleted = false;
            const closing = shutdownServer(server, {
                timeoutMs: 1_000,
                closeServices: () => lifecycle.close(),
            }).then(() => {
                shutdownCompleted = true;
            });
            await cleanupStarted.promise;
            await Promise.resolve();
            assert.equal(server.listening, false);
            assert.equal(shutdownCompleted, false);
            assert.deepEqual(calls, ["cleanup:start"]);

            releaseCleanup.resolve();
            await closing;
            assert.equal(shutdownCompleted, true);
            assert.deepEqual(calls, ["cleanup:start", "cleanup:idle", "storage:close"]);
        });
    });
}

// object-deletion-worker-fencing.test.ts
{
    function signal(): { promise: Promise<void>; resolve: () => void } {
        let resolve!: () => void;
        return {
            promise: new Promise<void>((settle) => { resolve = settle; }),
            resolve: () => resolve()
        };
    }

    describe('object deletion worker fencing', () => {
        postgresTest('object deletion lease fences stale worker failure after takeover', async () => {
            const database = await createPostgresTestDatabase('object-deletion-fence');
            let now = 1_000;
            const firstReached = signal();
            const releaseFirst = signal();
            const secondReached = signal();
            const releaseSecond = signal();
            let calls = 0;
            const storage = {
                async deletePrefix() {
                    calls += 1;
                    if (calls === 1) {
                        firstReached.resolve();
                        await releaseFirst.promise;
                        throw new Error('stale worker failure');
                    }
                    secondReached.resolve();
                    await releaseSecond.promise;
                }
            } as unknown as ObjectStorage;
            const jobId = '11111111-1111-4111-8111-111111111111';
            await database.prepare(
                `INSERT INTO object_deletion_jobs
            (id, resource_type, resource_id, target_kind, target, state,
             attempts, next_attempt_at, created_at, updated_at)
         VALUES (?, 'site-package-revision', ?, 'prefix', ?, 'pending', 0, ?, ?, ?)`
            ).bind(
                jobId,
                '22222222-2222-4222-8222-222222222222',
                'site-packages/package/revisions/fenced/',
                now,
                now,
                now
            ).run();
            const firstWorker = new PostgresqlObjectDeletionWorker(database, storage, { now: () => now });
            const secondWorker = new PostgresqlObjectDeletionWorker(database, storage, { now: () => now });

            const firstRun = firstWorker.run();
            await firstReached.promise;
            now += 5 * 60 * 1000 + 1;
            const secondRun = secondWorker.run();
            await secondReached.promise;
            releaseFirst.resolve();
            await firstRun;
            releaseSecond.resolve();
            await secondRun;

            assert.equal(calls, 2, 'the idempotent prefix delete may execute once per lease owner');
            assert.deepEqual(
                await queryOne<{ state: string; attempts: number; last_error: string | null }>(database,
                    'SELECT state, attempts, last_error FROM object_deletion_jobs WHERE id=?',
                    [jobId]
                ),
                { state: 'completed', attempts: 2, last_error: null }
            );
        });
    });
}

// object-deletion-worker.test.ts
{
    async function insertJob(
        database: ManagedSqlDatabase,
        id: string,
        resourceId: string,
        target: string,
        now: number
    ): Promise<void> {
        await database.prepare(
            `INSERT INTO object_deletion_jobs
            (id, resource_type, resource_id, target_kind, target, state,
             attempts, next_attempt_at, created_at, updated_at)
         VALUES (?, 'site-package-revision', ?, 'prefix', ?, 'pending', 0, ?, ?, ?)`
        ).bind(id, resourceId, target, now, now, now).run();
    }

    describe('PostgreSQL object deletion worker', () => {
        postgresTest('retries and atomically leases prefix jobs', async () => {
            const database = await createPostgresTestDatabase('object-deletion-worker');
            let now = 1_000;
            let failures = 1;
            const deleted: string[] = [];
            const storage = {
                async deletePrefix(prefix: string) {
                    deleted.push(prefix);
                    if (failures > 0) {
                        failures -= 1;
                        throw new Error('injected object deletion failure');
                    }
                }
            } as unknown as ObjectStorage;
            const worker = new PostgresqlObjectDeletionWorker(database, storage, {
                now: () => now,
                completedRetentionMs: 100,
                sweepIntervalMs: 0
            });
            const firstId = '11111111-1111-4111-8111-111111111111';
            await insertJob(
                database,
                firstId,
                '22222222-2222-4222-8222-222222222222',
                'site-packages/package/revisions/first/',
                now
            );

            await worker.run();
            assert.deepEqual(
                await queryOne<{ state: string; attempts: number; last_error: string }>(database,
                    'SELECT state, attempts, last_error FROM object_deletion_jobs WHERE id=?',
                    [firstId]
                ),
                {
                    state: 'failed',
                    attempts: 1,
                    last_error: 'injected object deletion failure'
                }
            );
            now += 1_000;
            await worker.run();
            assert.equal(
                (await queryOne<{ state: string; attempts: number }>(database,
                    'SELECT state, attempts FROM object_deletion_jobs WHERE id=?',
                    [firstId]
                ))?.state,
                'completed'
            );
            assert.deepEqual(deleted, [
                'site-packages/package/revisions/first/',
                'site-packages/package/revisions/first/'
            ]);

            now += 1;
            const secondId = '33333333-3333-4333-8333-333333333333';
            await insertJob(
                database,
                secondId,
                '44444444-4444-4444-8444-444444444444',
                'site-packages/package/revisions/second/',
                now
            );
            const competingWorker = new PostgresqlObjectDeletionWorker(
                database,
                storage,
                { now: () => now }
            );
            await Promise.all([worker.run(), competingWorker.run()]);
            assert.equal(
                deleted.filter((prefix) => prefix.endsWith('/second/')).length,
                1,
                'only one worker may execute a leased prefix deletion'
            );
            assert.equal(
                (await queryOne<{ state: string }>(database,
                    'SELECT state FROM object_deletion_jobs WHERE id=?',
                    [secondId]
                ))?.state,
                'completed'
            );

            now += 1;
            failures = 1;
            const thirdId = '55555555-5555-4555-8555-555555555555';
            await insertJob(
                database,
                thirdId,
                '66666666-6666-4666-8666-666666666666',
                'site-packages/package/revisions/third/',
                now
            );
            const quarantineWorker = new PostgresqlObjectDeletionWorker(database, storage, {
                now: () => now,
                maxAttempts: 1
            });
            await quarantineWorker.run();
            assert.ok((await queryOne<{ quarantined_at: number | null }>(database,
                'SELECT quarantined_at FROM object_deletion_jobs WHERE id=?',
                [thirdId]
            ))?.quarantined_at);
            assert.equal(await quarantineWorker.retryQuarantined(thirdId), true);
            assert.equal(await quarantineWorker.retryQuarantined(thirdId), false);
            await quarantineWorker.run();
            assert.equal(
                (await queryOne<{ state: string }>(database,
                    'SELECT state FROM object_deletion_jobs WHERE id=?',
                    [thirdId]
                ))?.state,
                'completed'
            );

            now += 101;
            await worker.run();
            assert.equal(
                (await queryOne<{ count: number }>(database,
                    'SELECT COUNT(*) AS count FROM object_deletion_jobs'
                ))?.count,
                0,
                'completed operational jobs are removed after their retention period'
            );
        });
    });
}

// object-protection-compensation.test.ts
{
    test.describe('object protection and its compensation', () => {
        test("are fenced to one object version", async () => {
            const enqueued: Array<{
                kind: string;
                payload: Record<string, unknown>;
            }> = [];
            let unfencedProtectCalls = 0;
            const storage: Partial<ObjectStorage> = {
                async currentObjectId() {
                    return "reviewed-object-id";
                },
                async protect() {
                    unfencedProtectCalls += 1;
                },
                async protectIfObjectId(key, objectId) {
                    assert.equal(key, "community/fudaba/cards/review/front.webp");
                    assert.equal(objectId, "reviewed-object-id");
                    throw new Error("temporary S3 failure");
                },
            };
            const runtime = {
                storage: storage as ObjectStorage,
                compensation: {
                    async enqueue(kind: string, payload: Record<string, unknown>) {
                        enqueued.push({ kind, payload });
                        return "job-id";
                    },
                    async run() {},
                },
            } as RuntimeServices;

            await protectObjectWithCompensation(
                runtime,
                "community/fudaba/cards/review/front.webp",
            );

            assert.equal(unfencedProtectCalls, 0);
            assert.deepEqual(enqueued, [
                {
                    kind: "protect-object",
                    payload: {
                        key: "community/fudaba/cards/review/front.webp",
                        objectId: "reviewed-object-id",
                    },
                },
            ]);
        });
    });
}

// object-read-response.test.ts
{
    test.describe('object read response', () => {
        test('S3-capable media responses redirect GET and HEAD without loading object bytes', async () => {
            const calls: Array<{ key: string; method?: 'GET' | 'HEAD' }> = [];
            let gets = 0;
            const storage = {
                async createReadUrl(key: string, options?: ObjectReadUrlOptions) {
                    calls.push({ key, method: options?.method });
                    return key.endsWith('missing.webp')
                        ? null
                        : {
                            url: `http://127.0.0.1:9000/imsweb-media-local/${key}` +
                                (key.includes('/private/') ? '?signed=true' : ''),
                            visibility: key.includes('/private/') ? 'private' : 'public'
                        } as const;
                },
                async get() {
                    gets += 1;
                    return null;
                }
            } as unknown as ObjectStorage;

            const get = await objectReadResponse(
                new Request('http://api.test/uploads/news/original/a.webp'),
                storage,
                'uploads/news/original/a.webp',
                { 'Cache-Control': 'public, max-age=31536000' }
            );
            assert.equal(get?.status, 307);
            assert.equal(get?.headers.get('location'),
                'http://127.0.0.1:9000/imsweb-media-local/uploads/news/original/a.webp');
            assert.equal(get?.headers.get('cache-control'), 'public, max-age=31536000');

            const head = await objectReadResponse(
                new Request('http://api.test/private/a.webp', { method: 'HEAD' }),
                storage,
                'uploads/private/a.webp'
            );
            assert.equal(head?.status, 307);
            assert.equal(head?.headers.get('cache-control'), 'private, no-store');
            assert.deepEqual(calls.map((call) => call.method), ['GET', 'HEAD']);
            assert.equal(gets, 0);
            assert.equal(await objectReadResponse(
                new Request('http://api.test/uploads/news/original/missing.webp'),
                storage,
                'uploads/news/original/missing.webp'
            ), null);
        });

        test('proxy mode bypasses signed URLs and preserves stored byte semantics', async () => {
            let readUrls = 0;
            let gets = 0;
            const body = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
            const storage = {
                async createReadUrl() {
                    readUrls += 1;
                    return {
                        url: 'https://private-media.example.test/avatar.webp?signed=1',
                        visibility: 'private'
                    } as const;
                },
                async get() {
                    gets += 1;
                    return {
                        body,
                        size: body.byteLength,
                        contentType: 'image/webp',
                        etag: 'avatar-etag'
                    };
                }
            } as unknown as ObjectStorage;

            const response = await objectReadResponse(
                new Request('http://api.test/api/platform/me/avatar', {
                    headers: { range: 'bytes=1-2' }
                }),
                storage,
                'protected/platform/avatar.webp',
                { 'Cache-Control': 'private, no-store' },
                { mode: 'proxy' }
            );

            assert.equal(response?.status, 206);
            assert.equal(response?.headers.get('content-type'), 'image/webp');
            assert.equal(response?.headers.get('content-range'), 'bytes 1-2/4');
            assert.equal(response?.headers.get('cache-control'), 'private, no-store');
            assert.deepEqual(new Uint8Array(await response!.arrayBuffer()), body.slice(1, 3));
            assert.equal(readUrls, 0);
            assert.equal(gets, 1);
        });

        test('public redirects receive a bounded cache policy when the handler has none', async () => {
            const storage = {
                async createReadUrl() {
                    return { url: 'https://cdn.example.test/wiki/icon.webp', visibility: 'public' } as const;
                }
            } as unknown as ObjectStorage;
            const response = await objectReadResponse(
                new Request('http://api.test/image/sc/mano/icon.webp'),
                storage,
                'wiki/agencies/sc/idols/mano/avatar/icon.webp'
            );
            assert.equal(response?.headers.get('cache-control'), 'public, max-age=300');
        });
    });
}
