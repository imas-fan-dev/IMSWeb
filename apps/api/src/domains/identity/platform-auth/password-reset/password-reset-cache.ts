import crypto from 'node:crypto';
import { PLATFORM_JWT_SECRET } from '@/config/env';
import type { CacheStore } from '@/ports/cache';

const CACHE_KEY_PREFIX = 'platform-password-reset-cooldown:';
const MAX_COOLDOWN_MS = 10 * 60 * 1000;

function cacheKey(normalizedEmail: string): string {
    const digest = crypto
        .createHmac('sha256', PLATFORM_JWT_SECRET)
        .update('platform-password-reset-cooldown\0', 'utf8')
        .update(normalizedEmail, 'utf8')
        .digest('hex');
    return `${CACHE_KEY_PREFIX}${digest}`;
}

function parseRetryAfter(value: string | null): number | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value) as { retryAfterAt?: unknown };
        return Number.isSafeInteger(parsed.retryAfterAt)
            ? Number(parsed.retryAfterAt)
            : null;
    } catch {
        return null;
    }
}

export async function readPlatformPasswordResetCooldown(
    cache: CacheStore | undefined,
    normalizedEmail: string,
    now = Date.now
): Promise<number | null> {
    if (!cache) return null;
    try {
        const retryAfterAt = parseRetryAfter(await cache.get(cacheKey(normalizedEmail)));
        if (retryAfterAt === null) return null;
        const remaining = Math.min(MAX_COOLDOWN_MS, retryAfterAt - now());
        if (remaining <= 0) {
            await cache.delete(cacheKey(normalizedEmail)).catch(() => undefined);
            return null;
        }
        return remaining;
    } catch {
        return null;
    }
}

export async function markPlatformPasswordResetCooldown(
    cache: CacheStore | undefined,
    normalizedEmail: string,
    retryAfterMs: number,
    now = Date.now
): Promise<void> {
    if (!cache || retryAfterMs <= 0) return;
    const bounded = Math.min(MAX_COOLDOWN_MS, retryAfterMs);
    try {
        await cache.set(
            cacheKey(normalizedEmail),
            JSON.stringify({ retryAfterAt: now() + bounded }),
            Math.max(1, Math.ceil(bounded / 1000))
        );
    } catch {
        // PostgreSQL remains authoritative for password reset state.
    }
}

export async function clearPlatformPasswordResetCooldown(
    cache: CacheStore | undefined,
    normalizedEmail: string
): Promise<void> {
    if (!cache) return;
    try {
        await cache.delete(cacheKey(normalizedEmail));
    } catch {
        // A stale cooldown cannot authorize a password reset.
    }
}
