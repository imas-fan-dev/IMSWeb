import assert from 'node:assert/strict';
import { test } from 'vitest';
import { CachedPlatformEmailResendPolicyReader } from '@/infra/cache/valkey/platform-email-resend-policy-reader';
import {
    VALKEY_PLATFORM_EMAIL_RESEND_POLICY_WRITE_SCRIPT,
    ValkeyPlatformEmailResendPolicyCache,
} from '@/infra/cache/valkey/platform-email-resend-policy';
import type {
    PlatformEmailResendPolicyCache,
    PlatformEmailResendPolicyRecord,
} from '@/ports/email-delivery';
import type {
    PlatformEmailConfigurationRecord,
    PlatformEmailConfigurationStore,
} from '@/ports/email';
import { withBoundedCacheOperation } from '@/utils/cache/bounded-operation';

const PREFIX = 'imsweb:test:';
const CACHE_KEY = `${PREFIX}platform-email-resend-policy:v1`;

interface StoredValue {
    value: string;
    expiresAt: number;
}

function strictPolicy(value: unknown): value is PlatformEmailResendPolicyRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return Object.keys(record).length === 2
        && Number.isSafeInteger(record.resendCooldownSeconds)
        && Number(record.resendCooldownSeconds) >= 30
        && Number(record.resendCooldownSeconds) <= 600
        && Number.isSafeInteger(record.updatedAt)
        && Number(record.updatedAt) >= 0;
}

class FakeValkeyPolicyServer {
    readonly commands: string[][] = [];
    readonly commandSignals: Array<AbortSignal | undefined> = [];
    readonly values = new Map<string, StoredValue>();
    now = 10_000;
    failReads = false;
    failWrites = false;
    nextEvalReply: unknown;

    seed(key: string, value: string, ttlSeconds = 5): void {
        this.values.set(key, {
            value,
            expiresAt: this.now + ttlSeconds * 1_000,
        });
    }

    advance(milliseconds: number): void {
        this.now += milliseconds;
    }

    async sendCommand<T = unknown>(
        args: readonly string[],
        options?: { abortSignal?: AbortSignal },
    ): Promise<T> {
        const command = [...args];
        this.commands.push(command);
        this.commandSignals.push(options?.abortSignal);
        if (command[0] === 'GET') {
            if (this.failReads) throw new Error('Valkey read failed');
            const key = command[1]!;
            const stored = this.values.get(key);
            if (!stored || stored.expiresAt <= this.now) {
                this.values.delete(key);
                return null as T;
            }
            return stored.value as T;
        }
        if (command[0] === 'EVAL') {
            if (this.failWrites) throw new Error('Valkey write failed');
            if (this.nextEvalReply !== undefined) {
                const reply = this.nextEvalReply;
                this.nextEvalReply = undefined;
                return reply as T;
            }
            assert.equal(command[1], VALKEY_PLATFORM_EMAIL_RESEND_POLICY_WRITE_SCRIPT);
            assert.equal(command[2], '1');
            assert.equal(command.length, 7);
            const key = command[3]!;
            const incomingRaw = command[4]!;
            const incomingUpdatedAt = Number(command[5]);
            const ttlSeconds = Number(command[6]);
            assert.equal(ttlSeconds, 5);
            const current = this.values.get(key);
            let currentPolicy: PlatformEmailResendPolicyRecord | null = null;
            if (current && current.expiresAt > this.now) {
                try {
                    const parsed: unknown = JSON.parse(current.value);
                    if (strictPolicy(parsed)) currentPolicy = parsed;
                } catch {
                    currentPolicy = null;
                }
            }
            if (currentPolicy && currentPolicy.updatedAt > incomingUpdatedAt) {
                return 0 as T;
            }
            this.seed(key, incomingRaw, ttlSeconds);
            return 1 as T;
        }
        throw new Error(`Unsupported fake Valkey command: ${String(command[0])}`);
    }
}

function configuration(
    overrides: Partial<PlatformEmailConfigurationRecord> = {},
): PlatformEmailConfigurationRecord {
    return {
        enabled: false,
        host: '',
        port: 465,
        security: 'tls',
        usernameCiphertext: null,
        passwordCiphertext: null,
        fromAddress: '',
        fromName: '',
        resendCooldownSeconds: 60,
        updatedAt: 1,
        ...overrides,
    };
}

function configurationStore(
    current: PlatformEmailConfigurationRecord,
): PlatformEmailConfigurationStore & { reads: number } {
    return {
        reads: 0,
        async getPlatformEmailConfiguration() {
            this.reads += 1;
            return current;
        },
        async updatePlatformEmailConfiguration() {
            throw new Error('update should not be called');
        },
    };
}

test('Valkey resend policy cache shares revisions across adapter instances', async () => {
    const server = new FakeValkeyPolicyServer();
    const first = new ValkeyPlatformEmailResendPolicyCache(server, {
        keyPrefix: PREFIX,
    });
    const second = new ValkeyPlatformEmailResendPolicyCache(server, {
        keyPrefix: PREFIX,
    });

    assert.equal(await first.writeIfNewer({
        resendCooldownSeconds: 60,
        updatedAt: 2,
    }), true);
    assert.deepEqual(await second.read(), {
        resendCooldownSeconds: 60,
        updatedAt: 2,
    });
    assert.equal(server.commands[0]?.[3], CACHE_KEY);
});

test('Valkey resend policy cache rejects delayed stale fills and refreshes equal revisions', async () => {
    const server = new FakeValkeyPolicyServer();
    const first = new ValkeyPlatformEmailResendPolicyCache(server, {
        keyPrefix: PREFIX,
    });
    const delayed = new ValkeyPlatformEmailResendPolicyCache(server, {
        keyPrefix: PREFIX,
    });

    await first.writeIfNewer({ resendCooldownSeconds: 30, updatedAt: 20 });
    assert.equal(await delayed.writeIfNewer({
        resendCooldownSeconds: 600,
        updatedAt: 19,
    }), false);
    assert.deepEqual(await first.read(), {
        resendCooldownSeconds: 30,
        updatedAt: 20,
    });

    server.advance(4_000);
    assert.equal(await delayed.writeIfNewer({
        resendCooldownSeconds: 30,
        updatedAt: 20,
    }), true);
    server.advance(4_999);
    assert.deepEqual(await first.read(), {
        resendCooldownSeconds: 30,
        updatedAt: 20,
    });
    server.advance(1);
    assert.equal(await first.read(), null);
});

test('Valkey resend policy cache replaces malformed data and validates replies', async () => {
    const server = new FakeValkeyPolicyServer();
    const cache = new ValkeyPlatformEmailResendPolicyCache(server, {
        keyPrefix: PREFIX,
    });

    server.seed(CACHE_KEY, '{malformed');
    assert.equal(await cache.read(), null);
    assert.equal(await cache.writeIfNewer({
        resendCooldownSeconds: 600,
        updatedAt: 5,
    }), true);
    assert.deepEqual(await cache.read(), {
        resendCooldownSeconds: 600,
        updatedAt: 5,
    });

    server.seed(CACHE_KEY, JSON.stringify({
        resendCooldownSeconds: 60,
        updatedAt: 6,
        host: 'smtp.example.com',
    }));
    assert.equal(await cache.read(), null);

    server.nextEvalReply = '1';
    await assert.rejects(
        cache.writeIfNewer({ resendCooldownSeconds: 60, updatedAt: 7 }),
        /unexpected reply/,
    );
});

test('resend policy reader uses a strict cache hit without reading PostgreSQL', async () => {
    const store = configurationStore(configuration({
        resendCooldownSeconds: 600,
        updatedAt: 10,
    }));
    const cache: PlatformEmailResendPolicyCache = {
        async read() {
            return { resendCooldownSeconds: 30, updatedAt: 11 };
        },
        async writeIfNewer() {
            throw new Error('refill should not be called');
        },
    };
    const reader = new CachedPlatformEmailResendPolicyReader(store, cache);

    assert.deepEqual(await reader.getPolicy(), {
        resendCooldownSeconds: 30,
        updatedAt: 11,
    });
    assert.equal(store.reads, 0);
});

test('resend policy reader falls back to PostgreSQL when Valkey reads and refills fail', async () => {
    const store = configurationStore(configuration({
        resendCooldownSeconds: 600,
        updatedAt: 12,
    }));
    const operations: string[] = [];
    const server = new FakeValkeyPolicyServer();
    server.failReads = true;
    server.failWrites = true;
    const reader = new CachedPlatformEmailResendPolicyReader(
        store,
        new ValkeyPlatformEmailResendPolicyCache(server, { keyPrefix: PREFIX }),
        (operation) => operations.push(operation),
    );

    assert.deepEqual(await reader.getPolicy(), {
        resendCooldownSeconds: 600,
        updatedAt: 12,
    });
    assert.equal(store.reads, 1);
    assert.deepEqual(operations, ['read', 'refill']);
    assert.equal(server.commandSignals.length, 2);
    assert.ok(server.commandSignals.every((signal) => signal instanceof AbortSignal));
});

test('resend policy reader aborts stalled Valkey reads and refills', async () => {
    const store = configurationStore(configuration({
        resendCooldownSeconds: 600,
        updatedAt: 14,
    }));
    const operations: string[] = [];
    const signals: AbortSignal[] = [];
    const pending = (signal?: AbortSignal) => {
        assert.ok(signal);
        signals.push(signal);
        return new Promise<never>((_resolve, reject) => {
            signal.addEventListener(
                'abort',
                () => reject(new Error('cache operation aborted')),
                { once: true },
            );
        });
    };
    const cache: PlatformEmailResendPolicyCache = {
        read: (signal) => pending(signal),
        writeIfNewer: (_record, signal) => pending(signal),
    };
    const reader = new CachedPlatformEmailResendPolicyReader(
        store,
        cache,
        (operation) => operations.push(operation),
    );

    assert.deepEqual(
        await withBoundedCacheOperation(() => reader.getPolicy(), 1_000),
        { resendCooldownSeconds: 600, updatedAt: 14 },
    );
    assert.equal(store.reads, 1);
    assert.deepEqual(operations, ['read', 'refill']);
    assert.equal(signals.length, 2);
    assert.ok(signals.every((signal) => signal.aborted));
});

test('resend policy reader refills a cache miss with the PostgreSQL revision', async () => {
    const store = configurationStore(configuration({
        resendCooldownSeconds: 30,
        updatedAt: 15,
    }));
    const writes: PlatformEmailResendPolicyRecord[] = [];
    const cache: PlatformEmailResendPolicyCache = {
        async read() {
            return null;
        },
        async writeIfNewer(record) {
            writes.push(record);
            return true;
        },
    };
    const reader = new CachedPlatformEmailResendPolicyReader(store, cache);

    assert.deepEqual(await reader.getPolicy(), {
        resendCooldownSeconds: 30,
        updatedAt: 15,
    });
    assert.deepEqual(writes, [{ resendCooldownSeconds: 30, updatedAt: 15 }]);
});
