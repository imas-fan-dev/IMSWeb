// Merged from 2 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import { assertConcurrentRateLimiterContract } from '../contracts/runtime-contracts.js';
import { FakeValkeyRateLimitServer } from './fake-valkey';
import { ValkeyCache } from '@/infra/cache/valkey/cache';
import { ValkeyRateLimiter } from '@/infra/cache/valkey/rate-limiter';
import { withBoundedCacheOperation } from '@/utils/cache/bounded-operation';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'vitest';

// valkey-cache.test.ts
{
    class FakeValkeyClient {
        readonly commands: string[][] = [];
        readonly values = new Map<string, string>();
        closed = false;
        stall = false;
        abortedCommands = 0;

        on(): this {
            return this;
        }

        async connect(): Promise<this> {
            return this;
        }

        async sendCommand<T = unknown>(
            args: readonly string[],
            options?: { abortSignal?: AbortSignal },
        ): Promise<T> {
            const command = [...args];
            this.commands.push(command);
            if (this.stall) {
                return new Promise<T>((_resolve, reject) => {
                    options?.abortSignal?.addEventListener(
                        "abort",
                        () => {
                            this.abortedCommands += 1;
                            reject(new Error("Valkey command aborted"));
                        },
                        { once: true },
                    );
                });
            }
            if (command[0] === "GET")
                return (this.values.get(command[1]!) ?? null) as T;
            if (command[0] === "SET") {
                this.values.set(command[1]!, command[2]!);
                return "OK" as T;
            }
            if (command[0] === "DEL") {
                this.values.delete(command[1]!);
                return 1 as T;
            }
            if (command[0] === "PING") return "PONG" as T;
            throw new Error(`Unexpected command: ${command.join(" ")}`);
        }

        async close(): Promise<void> {
            this.closed = true;
        }
    }

    test.describe('Valkey cache', () => {
        test("namespaces values and applies an expiration command", async () => {
            const client = new FakeValkeyClient();
            const cache = new ValkeyCache(client, { keyPrefix: "imsweb:cache:" });

            await cache.set("email-cooldown:abc", '{"retryAfterAt":123}', 60);
            assert.equal(await cache.get("email-cooldown:abc"), '{"retryAfterAt":123}');
            assert.deepEqual(client.commands.slice(0, 2), [
                [
                    "SET",
                    "imsweb:cache:email-cooldown:abc",
                    '{"retryAfterAt":123}',
                    "EX",
                    "60",
                ],
                ["GET", "imsweb:cache:email-cooldown:abc"],
            ]);

            await cache.delete("email-cooldown:abc");
            assert.equal(await cache.get("email-cooldown:abc"), null);
            await cache.ping();
            await cache.close();
            assert.equal(client.closed, true);
        });

        test("aborts a queued command at the caller deadline", async () => {
            const client = new FakeValkeyClient();
            client.stall = true;
            const cache = new ValkeyCache(client, { keyPrefix: "imsweb:cache:" });

            await assert.rejects(
                withBoundedCacheOperation(
                    (signal) => cache.get("email-cooldown:abc", { signal }),
                    1,
                ),
                /exceeded its deadline/,
            );
            assert.equal(client.abortedCommands, 1);
        });

        test("rejects invalid keys and TTLs before issuing commands", async () => {
            const client = new FakeValkeyClient();
            const cache = new ValkeyCache(client, { keyPrefix: "imsweb:cache:" });

            await assert.rejects(cache.set("key", "value", 0), /TTL/);
            await assert.rejects(cache.get("bad key"), /key/);
            assert.deepEqual(client.commands, []);
        });
    });
}

// valkey-rate-limiter.test.ts
{
    const PREFIX = 'imsweb:test:';

    function rateLimitWindowKey(bucket: string, key: string): string {
        const digest = crypto.createHash('sha256').update(key).digest('hex');
        return `${PREFIX}rate-limit:${bucket}:${digest}`;
    }

    async function typescriptFiles(directory: string): Promise<string[]> {
        const entries = await fs.readdir(directory, { withFileTypes: true });
        const files = await Promise.all(entries.map(async (entry) => {
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) return typescriptFiles(absolute);
            return /\.tsx?$/.test(entry.name) ? [absolute] : [];
        }));
        return files.flat();
    }

    test.describe('Valkey rate limiter', () => {
        test('shares one atomic budget across limiter instances', async () => {
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
                        rateLimitWindowKey('concurrent-contract', client)
                    );
                }
            });
        });

        test('resets expired windows and reports reset timestamps', async () => {
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

        test('exempts replayed identities without extra consumption', async () => {
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
                server.consumedFor(rateLimitWindowKey('uploads', 'client')),
                2
            );
        });

        test('never stores raw keys or identities', async () => {
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

        test('rejects invalid buckets, limits, and windows', async () => {
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
    });
}
