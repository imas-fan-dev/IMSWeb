import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresqlIdempotencyStore } from
    '@/infra/cache/postgresql/idempotency-store';
import { PostgresqlRateLimiter } from '@/infra/cache/postgresql/rate-limiter';
import { assertConcurrentRateLimiterContract } from '../contracts/runtime-contracts.js';
import {
    connectPostgresTestDatabase,
    createPostgresTestDatabase
} from './postgres-test-database';

test('PostgreSQL idempotency shares replay and fencing across connections', async (t) => {
    const database = await createPostgresTestDatabase(t, 'request-idempotency');
    const secondDatabase = connectPostgresTestDatabase(t, database);
    let now = 1_000_000;
    const options = { now: () => now, staleAfterMs: 1_000 };
    const first = new PostgresqlIdempotencyStore(database, options);
    const second = new PostgresqlIdempotencyStore(secondDatabase, options);

    const initial = await first.claim('chronicle:approve', 'shared-key', 'request');
    assert.deepEqual(initial, { kind: 'acquired', recovered: false, generation: 1 });
    assert.deepEqual(
        await second.claim('chronicle:approve', 'shared-key', 'request'),
        { kind: 'in-progress' }
    );
    if (initial.kind !== 'acquired') return;

    now += 1_001;
    const replacement = await second.claim(
        'chronicle:approve',
        'shared-key',
        'request'
    );
    assert.deepEqual(replacement, { kind: 'acquired', recovered: true, generation: 2 });
    if (replacement.kind !== 'acquired') return;

    await assert.rejects(() => first.complete(
        'chronicle:approve',
        'shared-key',
        'request',
        initial.generation,
        { status: 200, body: { owner: 'stale' } }
    ), /lease|claim/i);
    await first.fail(
        'chronicle:approve',
        'shared-key',
        'request',
        initial.generation
    );
    assert.equal(await second.isCurrent(
        'chronicle:approve',
        'shared-key',
        'request',
        replacement.generation
    ), true);

    await second.complete(
        'chronicle:approve',
        'shared-key',
        'request',
        replacement.generation,
        { status: 201, body: { owner: 'replacement' } }
    );
    assert.deepEqual(
        await first.claim('chronicle:approve', 'shared-key', 'request'),
        {
            kind: 'replay',
            response: { status: 201, body: { owner: 'replacement' } }
        }
    );
    assert.deepEqual(
        await first.claim('chronicle:approve', 'shared-key', 'different'),
        { kind: 'conflict' }
    );

    const nullBody = await first.claim('chronicle:approve', 'null-body', 'request');
    assert.equal(nullBody.kind, 'acquired');
    if (nullBody.kind !== 'acquired') return;
    await first.complete(
        'chronicle:approve',
        'null-body',
        'request',
        nullBody.generation,
        { status: 204, body: null }
    );
    assert.deepEqual(
        await second.claim('chronicle:approve', 'null-body', 'request'),
        { kind: 'replay', response: { status: 204, body: null } }
    );
});

test('PostgreSQL idempotency serializes concurrent first claims', async (t) => {
    const database = await createPostgresTestDatabase(t, 'idempotency-claim');
    const secondDatabase = connectPostgresTestDatabase(t, database);
    const stores = [
        new PostgresqlIdempotencyStore(database),
        new PostgresqlIdempotencyStore(secondDatabase)
    ];
    const claims = await Promise.all(Array.from({ length: 12 }, (_, index) =>
        stores[index % stores.length]!.claim('scope', 'concurrent', 'fingerprint')
    ));

    assert.equal(claims.filter((claim) => claim.kind === 'acquired').length, 1);
    assert.equal(claims.filter((claim) => claim.kind === 'in-progress').length, 11);
});

test('PostgreSQL idempotency sweeps only expired terminal records', async (t) => {
    const database = await createPostgresTestDatabase(t, 'idempotency-sweep');
    let now = 10_000;
    const store = new PostgresqlIdempotencyStore(database, {
        now: () => now,
        sweepIntervalMs: 0,
        terminalRetentionMs: 100
    });

    const completed = await store.claim('scope', 'completed', 'fingerprint');
    assert.equal(completed.kind, 'acquired');
    if (completed.kind !== 'acquired') return;
    await store.complete(
        'scope',
        'completed',
        'fingerprint',
        completed.generation,
        { status: 200, body: { ok: true } }
    );
    const failed = await store.claim('scope', 'failed', 'fingerprint');
    assert.equal(failed.kind, 'acquired');
    if (failed.kind !== 'acquired') return;
    await store.fail('scope', 'failed', 'fingerprint', failed.generation);
    assert.equal((await store.claim('scope', 'started', 'fingerprint')).kind, 'acquired');

    now += 101;
    await store.claim('scope', 'trigger', 'fingerprint');
    const rows = await database.prepare(
        `SELECT idempotency_key, state FROM request_idempotency_records
         WHERE scope=? ORDER BY idempotency_key`
    ).bind('scope').all<{ idempotency_key: string; state: string }>();
    assert.deepEqual(rows.results, [
        { idempotency_key: 'started', state: 'started' },
        { idempotency_key: 'trigger', state: 'started' }
    ]);
});

test('PostgreSQL rate limiter enforces one shared atomic budget', async (t) => {
    const database = await createPostgresTestDatabase(t, 'shared-rate-limit');
    const secondDatabase = connectPostgresTestDatabase(t, database);
    const limiters = [
        new PostgresqlRateLimiter(database),
        new PostgresqlRateLimiter(secondDatabase)
    ];
    let current = 0;

    await assertConcurrentRateLimiterContract({
        runtime: 'PostgreSQL',
        consume(client, identity) {
            const limiter = limiters[current++ % limiters.length]!;
            return limiter.consume(
                'concurrent-contract',
                client,
                30,
                60 * 60,
                { operation: 'chronicle:upload', identity }
            );
        },
        async count(client) {
            return await database.prepare(
                `SELECT consumed FROM rate_limit_windows
                 WHERE bucket=? AND limit_key=?`
            ).bind('concurrent-contract', client).first<number>('consumed') ?? 0;
        }
    });
});

test('PostgreSQL rate limiter resets expired windows', async (t) => {
    const database = await createPostgresTestDatabase(t, 'rate-limit-reset');
    let now = 10_000;
    const limiter = new PostgresqlRateLimiter(database, { now: () => now });

    assert.deepEqual(await limiter.consume('bucket', 'client', 2, 1), {
        allowed: true,
        remaining: 1,
        resetAt: 11_000
    });
    assert.deepEqual(await limiter.consume('bucket', 'client', 2, 1), {
        allowed: true,
        remaining: 0,
        resetAt: 11_000
    });
    assert.deepEqual(await limiter.consume('bucket', 'client', 2, 1), {
        allowed: false,
        remaining: 0,
        resetAt: 11_000
    });

    now = 11_001;
    assert.deepEqual(await limiter.consume('bucket', 'client', 2, 1), {
        allowed: true,
        remaining: 1,
        resetAt: 12_001
    });
});
