import crypto from "node:crypto";
import { PLATFORM_JWT_SECRET } from "@/config/env";
import type { CacheStore } from "@/ports/cache";

const CACHE_KEY_PREFIX = "platform-email-verification-cooldown:";
const MAX_COOLDOWN_MS = 10 * 60 * 1000;

interface CooldownValue {
    retryAfterAt: number;
}

export function platformEmailVerificationCacheKey(
    normalizedEmail: string,
): string {
    const digest = crypto
        .createHmac("sha256", PLATFORM_JWT_SECRET)
        .update("platform-email-verification-cooldown\0", "utf8")
        .update(normalizedEmail, "utf8")
        .digest("hex");
    return `${CACHE_KEY_PREFIX}${digest}`;
}

function parseCooldownValue(value: string | null): number | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value) as Partial<CooldownValue>;
        if (
            parsed.retryAfterAt === undefined ||
            !Number.isSafeInteger(parsed.retryAfterAt)
        )
            return null;
        return parsed.retryAfterAt;
    } catch {
        return null;
    }
}

export async function readPlatformEmailVerificationCooldown(
    cache: CacheStore | undefined,
    normalizedEmail: string,
    now = Date.now,
): Promise<number | null> {
    if (!cache) return null;
    const key = platformEmailVerificationCacheKey(normalizedEmail);
    try {
        const retryAfterAt = parseCooldownValue(await cache.get(key));
        if (retryAfterAt === null) return null;
        const remaining = Math.min(MAX_COOLDOWN_MS, retryAfterAt - now());
        if (remaining <= 0) {
            await cache.delete(key).catch(() => undefined);
            return null;
        }
        return remaining;
    } catch {
        // PostgreSQL remains authoritative when the cache is unavailable.
        return null;
    }
}

export async function markPlatformEmailVerificationCooldown(
    cache: CacheStore | undefined,
    normalizedEmail: string,
    retryAfterMs: number,
    now = Date.now,
): Promise<void> {
    if (!cache || retryAfterMs <= 0) return;
    const bounded = Math.min(MAX_COOLDOWN_MS, retryAfterMs);
    const retryAfterAt = now() + bounded;
    try {
        await cache.set(
            platformEmailVerificationCacheKey(normalizedEmail),
            JSON.stringify({ retryAfterAt }),
            Math.max(1, Math.ceil(bounded / 1000)),
        );
    } catch {
        // This is a best-effort read optimization, never the verification source of truth.
    }
}

export async function clearPlatformEmailVerificationCooldown(
    cache: CacheStore | undefined,
    normalizedEmail: string,
): Promise<void> {
    if (!cache) return;
    try {
        await cache.delete(platformEmailVerificationCacheKey(normalizedEmail));
    } catch {
        // A stale cooldown cannot authorize a registration or consume a code.
    }
}
