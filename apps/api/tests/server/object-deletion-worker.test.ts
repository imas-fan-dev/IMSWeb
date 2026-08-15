import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresqlObjectDeletionWorker } from '@/infra/db/postgresql/object-deletion-worker';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import type { ObjectStorage } from '@/ports/object-storage';
import { queryOne } from '@/infra/db/sql/query';
import { createPostgresTestDatabase } from './postgres-test-database';

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

test('PostgreSQL object deletion worker retries and atomically leases prefix jobs', async (t) => {
    const database = await createPostgresTestDatabase(t, 'object-deletion-worker');
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
