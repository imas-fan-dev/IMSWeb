import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
    ValkeyRateLimiter,
    valkeyRateLimitWindowKey
} from '@/infra/cache/valkey/rate-limiter';
import { assertConcurrentRateLimiterContract } from '../contracts/runtime-contracts.js';
import { FakeValkeyRateLimitServer } from './fake-valkey';

const PREFIX = 'imsweb:test:';

async function typescriptFiles(directory: string): Promise<string[]> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) return typescriptFiles(absolute);
        return /\.tsx?$/.test(entry.name) ? [absolute] : [];
    }));
    return files.flat();
}

test('Valkey rate limiter shares one atomic budget across limiter instances', async () => {
    const server = new FakeValkeyRateLimitServer();
    const limiters = [
        new ValkeyRateLimiter(server, { keyPrefix: PREFIX }),
        new ValkeyRateLimiter(server, { keyPrefix: PREFIX })
    ];
    let current = 0;

    await assertConcurrentRateLimiterContract({
        runtime: 'Valkey',
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
            return server.consumedFor(
                valkeyRateLimitWindowKey(PREFIX, 'concurrent-contract', client)
            );
        }
    });
});

test('Valkey rate limiter resets expired windows and reports reset timestamps', async () => {
    const server = new FakeValkeyRateLimitServer();
    let now = 10_000;
    const limiter = new ValkeyRateLimiter(server, {
        keyPrefix: PREFIX,
        now: () => now
    });

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

test('Valkey rate limiter exempts replayed identities without extra consumption', async () => {
    const server = new FakeValkeyRateLimitServer();
    const limiter = new ValkeyRateLimiter(server, {
        keyPrefix: PREFIX,
        now: () => 50_000
    });
    const identity = { operation: 'chronicle:upload', identity: 'activity-1' };

    assert.deepEqual(await limiter.consume('uploads', 'client', 2, 60, identity), {
        allowed: true,
        remaining: 1,
        resetAt: 110_000
    });
    assert.deepEqual(await limiter.consume('uploads', 'client', 2, 60, identity), {
        allowed: true,
        remaining: 1,
        resetAt: 110_000
    });
    assert.deepEqual(
        await limiter.consume('uploads', 'client', 2, 60, {
            operation: 'chronicle:upload',
            identity: 'activity-2'
        }),
        { allowed: true, remaining: 0, resetAt: 110_000 }
    );
    assert.equal(
        server.consumedFor(valkeyRateLimitWindowKey(PREFIX, 'uploads', 'client')),
        2
    );
});

test('Valkey rate limiter never stores raw keys or identities', async () => {
    const server = new FakeValkeyRateLimitServer();
    const limiter = new ValkeyRateLimiter(server, { keyPrefix: PREFIX });
    const email = 'user@example.test';
    await limiter.consume('platform-auth-login-account', email, 5, 60, {
        operation: 'login',
        identity: email
    });

    const storedKeys = [
        ...server.windows.keys(),
        ...server.identities.keys()
    ];
    for (const key of storedKeys) {
        assert.doesNotMatch(key, /user@example\.test/);
        assert.match(
            key,
            /^imsweb:test:rate-limit(?:-identities)?:platform-auth-login-account:[a-f0-9]{64}$/
        );
    }
    for (const members of server.identities.values()) {
        for (const member of members) {
            assert.doesNotMatch(member, /user@example\.test/);
            assert.match(member, /^[a-f0-9]{64}$/);
        }
    }
});

test('Valkey rate limiter rejects invalid buckets, limits, and windows', async () => {
    const server = new FakeValkeyRateLimitServer();
    const limiter = new ValkeyRateLimiter(server, { keyPrefix: PREFIX });

    await assert.rejects(
        limiter.consume('bad bucket!', 'client', 5, 60),
        /bucket must be a short safe identifier/
    );
    await assert.rejects(
        limiter.consume('bucket', 'client', 0, 60),
        /Rate limit must be a positive safe integer/
    );
    await assert.rejects(
        limiter.consume('bucket', 'client', 5, 0),
        /window must be a positive safe integer/
    );
});

test('domain and middleware code cannot depend on the Valkey rate limiter', async () => {
    const sourceRoot = path.resolve(__dirname, '../../src');
    const files = (
        await Promise.all(['domains', 'middleware'].map((directory) =>
            typescriptFiles(path.join(sourceRoot, directory))
        ))
    ).flat();
    for (const file of files) {
        const source = await fs.readFile(file, 'utf8');
        assert.doesNotMatch(
            source,
            /['"]@\/infra\/cache\/(?:valkey\/rate-limiter|memory\/rate-limiter)['"]/,
            `${path.relative(sourceRoot, file)} must depend on the RateLimiter port`
        );
    }
});
