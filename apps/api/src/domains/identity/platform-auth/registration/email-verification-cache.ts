import crypto from "node:crypto";
import { PLATFORM_JWT_SECRET } from "@/config/env";
import type { CacheStore } from "@/ports/cache";
import { withBoundedCacheOperation } from "@/utils/cache/bounded-operation";

const CACHE_KEY_PREFIX = "platform-email-verification-cooldown:";
const MIN_COOLDOWN_SECONDS = 30;
const MAX_COOLDOWN_SECONDS = 600;
const MAX_COOLDOWN_MS = MAX_COOLDOWN_SECONDS * 1000;

interface CooldownValue {
    enqueuedAt: number;
    resendCooldownSeconds: number;
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

function isCooldownValue(value: unknown): value is CooldownValue {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return Object.keys(record).length === 3
        && Number.isSafeInteger(record.enqueuedAt)
        && Number(record.enqueuedAt) >= 0
        && Number.isSafeInteger(record.resendCooldownSeconds)
        && Number(record.resendCooldownSeconds) >= MIN_COOLDOWN_SECONDS
        && Number(record.resendCooldownSeconds) <= MAX_COOLDOWN_SECONDS
        && Number.isSafeInteger(record.retryAfterAt)
        && Number(record.retryAfterAt)
            === Number(record.enqueuedAt)
                + Number(record.resendCooldownSeconds) * 1000;
}

function parseCooldownValue(value: string | null): CooldownValue | null {
    if (!value) return null;
    try {
        const parsed: unknown = JSON.parse(value);
        return isCooldownValue(parsed) ? parsed : null;
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
        const cooldown = parseCooldownValue(
            await withBoundedCacheOperation(
                (signal) => cache.get(key, { signal }),
            ),
        );
        if (!cooldown) return null;
        const remaining = Math.min(
            MAX_COOLDOWN_MS,
            cooldown.retryAfterAt - now(),
        );
        if (remaining <= 0) {
            await withBoundedCacheOperation(
                (signal) => cache.delete(key, { signal }),
            ).catch(
                () => undefined,
            );
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
    cooldown: CooldownValue,
    now = Date.now,
): Promise<void> {
    if (!cache || !isCooldownValue(cooldown)) return;
    const remaining = Math.min(MAX_COOLDOWN_MS, cooldown.retryAfterAt - now());
    if (remaining <= 0) return;
    try {
        await withBoundedCacheOperation((signal) =>
            cache.set(
                platformEmailVerificationCacheKey(normalizedEmail),
                JSON.stringify(cooldown),
                Math.max(
                    1,
                    Math.min(MAX_COOLDOWN_SECONDS, Math.ceil(remaining / 1000)),
                ),
                { signal },
            ),
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
        await withBoundedCacheOperation((signal) =>
            cache.delete(
                platformEmailVerificationCacheKey(normalizedEmail),
                { signal },
            ),
        );
    } catch {
        // A stale cooldown cannot authorize a registration or consume a code.
    }
}
