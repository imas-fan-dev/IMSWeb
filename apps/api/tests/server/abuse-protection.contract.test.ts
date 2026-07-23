import test from 'node:test';
import { createHonoApp } from '@/app';
import { MemoryRateLimiter } from '@/adapters/node/memory-rate-limiter';
import type { CoreRepository } from '@/ports/core-repository';
import type { ObjectStorage } from '@/ports/object-storage';
import type { RuntimeServices } from '@/ports/runtime-services';
import { assertAbuseProtectionContract } from '../contracts/runtime-contracts.js';

const CARD_ID = 700;
const CLIENT_ADDRESS = '203.0.113.70';

test('[SECURITY] shared JSON and abuse limits use the Node memory limiter', async () => {
    const limiter = new MemoryRateLimiter();
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
        config: { clientAddressSource: 'nginx' }
    };
    const app = createHonoApp(() => runtime);

    await assertAbuseProtectionContract({
        runtime: 'Node',
        cardId: CARD_ID,
        request(path, init = {}) {
            const headers = new Headers(init.headers);
            headers.set('X-Forwarded-For', CLIENT_ADDRESS);
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
            const windows = (limiter as unknown as {
                windows: Map<string, { identities: Set<string> }>;
            }).windows;
            return windows.get(`${bucket}\0${CLIENT_ADDRESS}`)?.identities.size ?? 0;
        },
        compensationCount: () => compensationRuns,
        handlerSnapshot: () => ({ ...calls })
    });
});
