import assert from "node:assert/strict";
import test from "node:test";
import type { CacheOperationOptions, CacheStore } from "@/ports/cache";
import {
    clearPlatformEmailVerificationCooldown,
    markPlatformEmailVerificationCooldown,
    platformEmailVerificationCacheKey,
    readPlatformEmailVerificationCooldown,
} from "@/domains/identity/platform-auth/registration/email-verification-cache";
import {
    clearPlatformPasswordResetCooldown,
    markPlatformPasswordResetCooldown,
    platformPasswordResetCacheKey,
    platformPasswordResetRecipientKey,
    readPlatformPasswordResetCooldown,
} from "@/domains/identity/platform-auth/password-reset/password-reset-cache";
import { MemoryCache } from "@/infra/cache/memory/cache";
import { withBoundedCacheOperation } from "@/utils/cache/bounded-operation";

class HangingCache implements CacheStore {
    abortedOperations = 0;

    private pending<T>(options?: CacheOperationOptions): Promise<T> {
        return new Promise<T>((_resolve, reject) => {
            options?.signal?.addEventListener(
                "abort",
                () => {
                    this.abortedOperations += 1;
                    reject(new Error("cache operation aborted"));
                },
                { once: true },
            );
        });
    }

    get(_key: string, options?: CacheOperationOptions): Promise<string | null> {
        return this.pending(options);
    }
    set(
        _key: string,
        _value: string,
        _ttlSeconds: number,
        options?: CacheOperationOptions,
    ): Promise<void> {
        return this.pending(options);
    }
    delete(_key: string, options?: CacheOperationOptions): Promise<void> {
        return this.pending(options);
    }
    ping(): Promise<void> {
        return this.pending();
    }
    async close(): Promise<void> {}
}

class FailingCache implements CacheStore {
    async get(): Promise<string | null> {
        throw new Error("cache unavailable");
    }
    async set(): Promise<void> {
        throw new Error("cache unavailable");
    }
    async delete(): Promise<void> {
        throw new Error("cache unavailable");
    }
    async ping(): Promise<void> {
        throw new Error("cache unavailable");
    }
    async close(): Promise<void> {}
}

test("platform email cooldown uses an anonymous key, strict snapshot, and deadline TTL", async () => {
    let now = 1_000_000;
    const cache = new MemoryCache(() => now);
    const email = "Producer@example.test";
    const key = platformEmailVerificationCacheKey(email);
    const cooldown = {
        enqueuedAt: now,
        resendCooldownSeconds: 60,
        retryAfterAt: now + 60_000,
    };

    assert.match(key, /^platform-email-verification-cooldown:[a-f0-9]{64}$/);
    assert.equal(key.includes(email), false);
    await markPlatformEmailVerificationCooldown(cache, email, cooldown, () => now);
    assert.deepEqual(JSON.parse((await cache.get(key)) || "null"), cooldown);
    assert.equal(
        await readPlatformEmailVerificationCooldown(cache, email, () => now),
        60_000,
    );

    now += 60_001;
    assert.equal(
        await readPlatformEmailVerificationCooldown(cache, email, () => now),
        null,
    );
});

test("platform email cooldown can be cleared after delivery or registration", async () => {
    const cache = new MemoryCache(() => 1_000_000);
    const email = "clear@example.test";
    await markPlatformEmailVerificationCooldown(
        cache,
        email,
        {
            enqueuedAt: 1_000_000,
            resendCooldownSeconds: 60,
            retryAfterAt: 1_060_000,
        },
        () => 1_000_000,
    );
    await clearPlatformEmailVerificationCooldown(cache, email);
    assert.equal(
        await readPlatformEmailVerificationCooldown(
            cache,
            email,
            () => 1_000_000,
        ),
        null,
    );
});

test("platform email cooldown rejects malformed records and fails open when unavailable", async () => {
    const now = 1_000_000;
    const malformedCache = new MemoryCache(() => now);
    const email = "fallback@example.test";
    const key = platformEmailVerificationCacheKey(email);
    for (const value of [
        { enqueuedAt: now, resendCooldownSeconds: 29, retryAfterAt: now + 29_000 },
        { enqueuedAt: now, resendCooldownSeconds: 601, retryAfterAt: now + 601_000 },
        { enqueuedAt: now, resendCooldownSeconds: 60, retryAfterAt: now + 59_000 },
        {
            enqueuedAt: now,
            resendCooldownSeconds: 60,
            retryAfterAt: now + 60_000,
            extra: true,
        },
    ]) {
        await malformedCache.set(key, JSON.stringify(value), 600);
        assert.equal(
            await readPlatformEmailVerificationCooldown(
                malformedCache,
                email,
                () => now,
            ),
            null,
        );
    }

    const cache = new FailingCache();
    await markPlatformEmailVerificationCooldown(cache, email, {
        enqueuedAt: now,
        resendCooldownSeconds: 60,
        retryAfterAt: now + 60_000,
    });
    await clearPlatformEmailVerificationCooldown(cache, email);
    assert.equal(await readPlatformEmailVerificationCooldown(cache, email), null);
});

test("email cooldown cache operations abort when the backend never settles", async () => {
    const now = 1_000_000;
    const cache = new HangingCache();
    const cooldown = {
        enqueuedAt: now,
        resendCooldownSeconds: 60,
        retryAfterAt: now + 60_000,
    };

    await assert.rejects(
        withBoundedCacheOperation(
            (signal) => cache.get("direct", { signal }),
            1,
        ),
        /exceeded its deadline/,
    );
    const [registration, passwordReset] = await withBoundedCacheOperation(
        () => Promise.all([
            Promise.all([
                readPlatformEmailVerificationCooldown(
                    cache,
                    "bounded-registration@example.test",
                    () => now,
                ),
                markPlatformEmailVerificationCooldown(
                    cache,
                    "bounded-registration@example.test",
                    cooldown,
                    () => now,
                ),
                clearPlatformEmailVerificationCooldown(
                    cache,
                    "bounded-registration@example.test",
                ),
            ]),
            Promise.all([
                readPlatformPasswordResetCooldown(
                    cache,
                    "bounded-reset@example.test",
                    () => now,
                ),
                markPlatformPasswordResetCooldown(
                    cache,
                    "bounded-reset@example.test",
                    cooldown,
                    () => now,
                ),
                clearPlatformPasswordResetCooldown(
                    cache,
                    "bounded-reset@example.test",
                ),
            ]),
        ]),
        1_000,
    );

    assert.equal(registration[0], null);
    assert.equal(passwordReset[0], null);
    assert.equal(cache.abortedOperations, 7);
});

test("password reset cooldown uses the same strict snapshot without exposing email", async () => {
    const now = 2_000_000;
    const cache = new MemoryCache(() => now);
    const email = "reset@example.test";
    const recipientKey = platformPasswordResetRecipientKey(email);
    const key = platformPasswordResetCacheKey(email);
    const cooldown = {
        enqueuedAt: now,
        resendCooldownSeconds: 600,
        retryAfterAt: now + 600_000,
    };

    assert.match(recipientKey, /^[a-f0-9]{64}$/);
    assert.equal(key, `platform-password-reset-cooldown:${recipientKey}`);
    assert.notEqual(
        recipientKey,
        platformEmailVerificationCacheKey(email).split(":")[1],
    );
    assert.equal(recipientKey.includes(email), false);
    assert.equal(key.includes(email), false);
    await markPlatformPasswordResetCooldown(cache, email, cooldown, () => now);
    assert.deepEqual(JSON.parse((await cache.get(key)) || "null"), cooldown);
    assert.equal(
        await readPlatformPasswordResetCooldown(cache, email, () => now),
        600_000,
    );

    await cache.set(
        key,
        JSON.stringify({ ...cooldown, resendCooldownSeconds: 60 }),
        600,
    );
    assert.equal(
        await readPlatformPasswordResetCooldown(cache, email, () => now),
        null,
    );
});
