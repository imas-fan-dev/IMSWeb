import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { getClientAddress, services } from '@/middleware/hono-context';
import { sha256Hex } from '@/utils/crypto/sha256';
import { withdrawalToken } from '@/domains/namecards/request';
import type { NamecardRateLimitResponse } from '@/domains/namecards/response';

export async function enforceSubmissionLimit(
    c: Context<AppEnvironment>,
    id: number
): Promise<Response | null> {
    const limiter = services(c).rateLimiter;
    if (!limiter) return null;
    const [byIp, bySubmission] = await Promise.all([
        limiter.consume('namecard-submission-ip', getClientAddress(c), 60, 60 * 60),
        limiter.consume('namecard-submission-id', String(id), 30, 60 * 60)
    ]);
    return byIp.allowed && bySubmission.allowed
        ? null
        : c.json({ error: 'Too many requests' } satisfies NamecardRateLimitResponse, 429);
}

export async function withdrawalTokenHash(c: Context<AppEnvironment>): Promise<string | null> {
    const token = withdrawalToken(c.req.raw);
    return token
        ? sha256Hex(new TextEncoder().encode(token))
        : null;
}
