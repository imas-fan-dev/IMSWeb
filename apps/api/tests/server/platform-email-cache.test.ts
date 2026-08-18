import assert from "node:assert/strict";
import test from "node:test";
import type { CacheStore } from "@/ports/cache";
import {
    clearPlatformEmailVerificationCooldown,
    markPlatformEmailVerificationCooldown,
    platformEmailVerificationCacheKey,
    readPlatformEmailVerificationCooldown,
} from "@/domains/identity/platform-auth/registration/email-verification-cache";
import { MemoryCache } from "@/infra/cache/memory/cache";

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

test("platform email cooldown uses an anonymous key and expires", async () => {
    let now = 1_000_000;
    const cache = new MemoryCache(() => now);
    const email = "Producer@example.test";
    const key = platformEmailVerificationCacheKey(email);

    assert.match(key, /^platform-email-verification-cooldown:[a-f0-9]{64}$/);
    assert.equal(key.includes(email), false);
    await markPlatformEmailVerificationCooldown(
        cache,
        email,
        60_000,
        () => now,
    );
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
        60_000,
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

test("platform email cooldown fails open when the cache is unavailable", async () => {
    const cache = new FailingCache();
    const email = "fallback@example.test";

    await markPlatformEmailVerificationCooldown(cache, email, 60_000);
    await clearPlatformEmailVerificationCooldown(cache, email);
    assert.equal(
        await readPlatformEmailVerificationCooldown(cache, email),
        null,
    );
});
