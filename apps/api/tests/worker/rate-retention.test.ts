import { env } from 'cloudflare:workers';
import { applyD1Migrations, reset } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { D1RateLimiter } from '@/adapters/cloudflare/d1-rate-limiter';
import type { WorkerBindings } from '@/adapters/cloudflare/worker-bindings';

const bindings = env as Cloudflare.Env & WorkerBindings;

async function applyCoreMigrations(): Promise<void> {
    await applyD1Migrations(bindings.CORE_DB, bindings.TEST_CORE_MIGRATIONS);
}

async function countWhere(predicate: string): Promise<number> {
    return await bindings.CORE_DB.prepare(
        `SELECT COUNT(*) FROM rate_limit_events WHERE ${predicate}`
    ).first<number>('COUNT(*)') ?? 0;
}

async function seedExpired(
    bucket: string,
    count: number,
    nowSeconds: number
): Promise<void> {
    await bindings.CORE_DB.prepare(
        `WITH RECURSIVE sequence(value) AS (
            VALUES(1)
            UNION ALL SELECT value + 1 FROM sequence WHERE value < ?
         )
         INSERT INTO rate_limit_events
            (bucket, client_key, window_start, operation, event_identity, expires_at)
         SELECT ?, 'expired-client', ?, 'fixture', 'expired-' || value, ?
         FROM sequence`
    ).bind(count, bucket, nowSeconds - 7200, nowSeconds - 1).run();
}

beforeEach(async () => {
    await reset();
    await applyCoreMigrations();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('D1 rate-limit retention', () => {
    it('removes a large expired backlog in bounded sweeps and preserves active rows', async () => {
        const baseSeconds = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
        vi.spyOn(Date, 'now').mockReturnValue(baseSeconds * 1000);
        const activeWindowStart = Math.floor(baseSeconds / 3600) * 3600;

        await seedExpired('expired-fixture', 300, baseSeconds);
        await bindings.CORE_DB.batch([
            bindings.CORE_DB.prepare(
                `INSERT INTO rate_limit_events
                    (bucket, client_key, window_start, operation, event_identity, expires_at)
                 VALUES ('active-fixture', 'active-client', ?, 'fixture', 'active-1', ?)`
            ).bind(activeWindowStart, baseSeconds + 3600),
            bindings.CORE_DB.prepare(
                `INSERT INTO rate_limit_events
                    (bucket, client_key, window_start, operation, event_identity, expires_at)
                 VALUES ('active-fixture', 'active-client', ?, 'fixture', 'active-2', ?)`
            ).bind(activeWindowStart, baseSeconds + 3600)
        ]);

        const limiter = new D1RateLimiter(bindings.CORE_DB);
        const consume = (identity: string) => limiter.consume(
            'retention-probe',
            'probe-client',
            30,
            3600,
            { operation: 'retention:test', identity }
        );

        await consume('probe-1');
        const afterFirstSweep = await countWhere("bucket='expired-fixture'");
        expect(afterFirstSweep).toBe(172);
        expect(await countWhere("bucket='active-fixture'")).toBe(2);

        await consume('probe-2');
        expect(await countWhere("bucket='expired-fixture'")).toBe(44);
        await consume('probe-3');
        expect(await countWhere("bucket='expired-fixture'")).toBe(0);
        await consume('probe-4');
        expect(await countWhere("bucket='expired-fixture'")).toBe(0);
        expect(await countWhere("bucket='active-fixture'")).toBe(2);
    });

    it('uses database-local maintenance state after the D1 database is reset', async () => {
        const baseSeconds = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
        vi.spyOn(Date, 'now').mockReturnValue(baseSeconds * 1000);

        await seedExpired('before-reset', 1, baseSeconds);
        await new D1RateLimiter(bindings.CORE_DB).consume(
            'reset-probe', 'before', 30, 3600,
            { operation: 'retention:test', identity: 'before-reset' }
        );
        expect(await countWhere("bucket='before-reset'")).toBe(0);

        await reset();
        await applyCoreMigrations();
        await seedExpired('after-reset', 1, baseSeconds);
        await new D1RateLimiter(bindings.CORE_DB).consume(
            'reset-probe', 'after', 30, 3600,
            { operation: 'retention:test', identity: 'after-reset' }
        );

        expect(await countWhere("bucket='after-reset'")).toBe(0);
    });

    it('claims one concurrent sweep and keeps the 30-event cap atomic', async () => {
        const baseSeconds = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
        vi.spyOn(Date, 'now').mockReturnValue(baseSeconds * 1000);
        await seedExpired('concurrent-expired', 10, baseSeconds);

        let sweepStatements = 0;
        const trackedDatabase = {
            prepare(query: string) {
                if (query.includes('DELETE FROM rate_limit_events')) sweepStatements += 1;
                return bindings.CORE_DB.prepare(query);
            }
        } as D1Database;
        const limiter = new D1RateLimiter(trackedDatabase);
        const replays = await Promise.all(Array.from({ length: 31 }, () =>
            limiter.consume(
                'retention-concurrent',
                'replay-client',
                30,
                3600,
                { operation: 'chronicle:upload', identity: 'same-identity' }
            )
        ));
        const results = await Promise.all(Array.from({ length: 31 }, (_, index) =>
            limiter.consume(
                'retention-concurrent',
                'same-client',
                30,
                3600,
                { operation: 'chronicle:upload', identity: `identity-${index}` }
            )
        ));

        expect(replays.every((result) => result.allowed)).toBe(true);
        expect(sweepStatements).toBe(1);
        expect(await countWhere("bucket='concurrent-expired'")).toBe(0);
        expect(await countWhere("bucket='retention-concurrent' AND client_key='replay-client'"))
            .toBe(1);
        expect(results.filter((result) => result.allowed)).toHaveLength(30);
        expect(results.filter((result) => !result.allowed)).toHaveLength(1);
        expect(await countWhere("bucket='retention-concurrent' AND client_key='same-client'"))
            .toBe(30);
    });
});
