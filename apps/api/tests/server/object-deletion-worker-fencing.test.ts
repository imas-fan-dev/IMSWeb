import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresqlObjectDeletionWorker } from '@/infra/db/postgresql/object-deletion-worker';
import type { ObjectStorage } from '@/ports/object-storage';
import { queryOne } from '@/infra/db/sql/query';
import { createPostgresTestDatabase } from './postgres-test-database';

function signal(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    return {
        promise: new Promise<void>((settle) => { resolve = settle; }),
        resolve: () => resolve()
    };
}

test('object deletion lease fences stale worker failure after takeover', async (t) => {
    const database = await createPostgresTestDatabase(t, 'object-deletion-fence');
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
