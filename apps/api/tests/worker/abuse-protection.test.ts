import { env } from 'cloudflare:workers';
import { applyD1Migrations, reset } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';
import { createHonoApp } from '@/app';
import { D1RateLimiter } from '@/adapters/cloudflare/d1-rate-limiter';
import type { WorkerBindings } from '@/adapters/cloudflare/worker-bindings';
import type { CoreRepository } from '@/ports/core-repository';
import type { ObjectStorage } from '@/ports/object-storage';
import type { RuntimeServices } from '@/ports/runtime-services';
import { assertAbuseProtectionContract } from '../contracts/runtime-contracts.js';

const bindings = env as Cloudflare.Env & WorkerBindings;
const CARD_ID = 700;
const CLIENT_ADDRESS = '203.0.113.71';

beforeEach(() => reset());

it('[SECURITY] shared JSON and abuse limits use the Worker D1 limiter', async () => {
    await applyD1Migrations(bindings.CORE_DB, bindings.TEST_CORE_MIGRATIONS);
    const limiter = new D1RateLimiter(bindings.CORE_DB);
    let rejectNextGlobal = false;
    let compensationRuns = 0;
    const calls = { userLookups: 0, reactionLookups: 0, reactionMutations: 0 };
    const core = {
        async findUserByUsername() {
            calls.userLookups += 1;
            return null;
        },
        async findApprovedCard(id: number) {
            calls.reactionLookups += 1;
            return id === CARD_ID ? { id } : null;
        },
        async incrementReaction() {
            calls.reactionMutations += 1;
        }
    } as unknown as CoreRepository;
    const runtime: RuntimeServices = {
        core,
        compensation: {
            async enqueue() { return 'unused'; },
            async run() { compensationRuns += 1; }
        },
        rateLimiter: {
            consume(bucket, key, limit, windowSeconds, identity) {
                if (bucket === 'global' && rejectNextGlobal) {
                    rejectNextGlobal = false;
                    return Promise.resolve({
                        allowed: false,
                        remaining: 0,
                        resetAt: Date.now() + windowSeconds * 1000
                    });
                }
                return limiter.consume(bucket, key, limit, windowSeconds, identity);
            }
        },
        storage: {} as ObjectStorage,
        config: { clientAddressSource: 'cloudflare' }
    };
    const app = createHonoApp(() => runtime);

    await expect(assertAbuseProtectionContract({
        runtime: 'Worker',
        cardId: CARD_ID,
        request(path, init = {}) {
            const headers = new Headers(init.headers);
            headers.set('CF-Connecting-IP', CLIENT_ADDRESS);
            return Promise.resolve(app.request(`http://ims.test${path}`, { ...init, headers }));
        },
        blockNextGlobal() { rejectNextGlobal = true; },
        async primeRateLimit(bucket, count, limit, windowSeconds) {
            for (let index = 0; index < count; index += 1) {
                const result = await limiter.consume(bucket, CLIENT_ADDRESS, limit, windowSeconds);
                if (!result.allowed) throw new Error(`${bucket} unexpectedly rejected prime request ${index + 1}`);
            }
        },
        async rateLimitCount(bucket) {
            return await bindings.CORE_DB.prepare(
                `SELECT COUNT(*) FROM rate_limit_events
                 WHERE bucket=? AND client_key=?`
            ).bind(bucket, CLIENT_ADDRESS).first<number>('COUNT(*)') ?? 0;
        },
        compensationCount: () => compensationRuns,
        handlerSnapshot: () => ({ ...calls })
    })).resolves.toBeUndefined();
});
