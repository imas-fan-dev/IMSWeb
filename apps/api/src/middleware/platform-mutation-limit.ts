import type { Context, MiddlewareHandler, Next } from 'hono';
import type { AppEnvironment } from '@/app';
import { services } from '@/middleware/hono-context';

function limiter(
    bucket: string,
    limit: number
): MiddlewareHandler<AppEnvironment> {
    return async (c: Context<AppEnvironment>, next: Next): Promise<Response | void> => {
        const accountId = c.get('platformUser')?.id;
        const rateLimiter = services(c).rateLimiter;
        if (!accountId || !rateLimiter) {
            await next();
            return;
        }
        const result = await rateLimiter.consume(bucket, accountId, limit, 60 * 60);
        if (!result.allowed) {
            c.header(
                'Retry-After',
                String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)))
            );
            return c.json({ success: false, code: 'PLATFORM_RATE_LIMITED' }, 429);
        }
        await next();
    };
}

export const platformWriteRateLimit = limiter('platform-write-account', 120);
// Account-dimension companions to the path-level buckets in rate-limit.ts: one
// shared IP cannot exhaust a single account, and one account cannot brute-force
// its own current password from many addresses.
export const platformPasswordRateLimit = limiter('platform-security-password-account', 10);
export const platformSessionRateLimit = limiter('platform-security-session-account', 60);
// An account owns a handful of links at most, so a generous ceiling still leaves
// no room for grinding the endpoint to enumerate provider codes.
export const platformOAuthLinkRateLimit = limiter('platform-security-oauth-account', 30);
export const platformUploadRateLimit = limiter('platform-upload-account', 30);
export const platformLocationRateLimit = limiter('fudaba-location-account', 12);
