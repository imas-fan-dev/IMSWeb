import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    BACKOFFICE_ACCESS_TOKEN_TTL_SECONDS,
    BACKOFFICE_REFRESH_TOKEN_TTL_SECONDS,
    backofficeAccessTokenClaims,
    clearBackofficeAuthenticationCookies,
    hashBackofficeAuthSecret,
    hasValidBackofficeRefreshCsrf,
    backofficeRefreshTokenCookie,
    setBackofficeAuthenticationCookies
} from '@/domains/backoffice-auth/backoffice-auth-session';
import { backofficeAuthRepository, services } from '@/middleware/hono-context';
import { constantTimeEqual } from '@/utils/crypto/constant-time';
import { randomHex } from '@/utils/crypto/random';

function rejectRefresh(c: Context<AppEnvironment>, message: string): Response {
    clearBackofficeAuthenticationCookies(c);
    return c.json({ success: false, message }, 401);
}

export async function handleBackofficeRefresh(c: Context<AppEnvironment>): Promise<Response> {
    const refreshToken = backofficeRefreshTokenCookie(c);
    if (!refreshToken) return rejectRefresh(c, '刷新令牌无效');

    const repository = backofficeAuthRepository(c);
    const tokenHash = await hashBackofficeAuthSecret(refreshToken);
    const session = await repository.findRefreshSessionByTokenHash(tokenHash);
    if (!session) return rejectRefresh(c, '刷新令牌无效');
    if (!await hasValidBackofficeRefreshCsrf(c, session)) {
        return c.json({ success: false, message: 'CSRF token invalid' }, 403);
    }

    const now = Math.floor(Date.now() / 1000);
    if (
        session.revoked_at !== null || session.expires_at <= now ||
        !constantTimeEqual(session.token_hash, tokenHash)
    ) {
        await repository.revokeRefreshSession(session.id, now);
        return rejectRefresh(c, '刷新令牌已失效');
    }

    const user = await repository.findUserById(session.account_id);
    if (!user) {
        await repository.revokeRefreshSession(session.id, now);
        return rejectRefresh(c, '刷新令牌无效');
    }

    const runtime = services(c);
    if (!runtime.backofficeTokens) {
        throw new Error('Backoffice authentication services unavailable');
    }
    const csrfSecret = c.req.header('x-csrftoken') || c.req.header('x-csrf-token') || '';
    const nextRefreshToken = randomHex(32);
    const [accessToken, nextTokenHash] = await Promise.all([
        runtime.backofficeTokens.sign(
            backofficeAccessTokenClaims(user, csrfSecret),
            BACKOFFICE_ACCESS_TOKEN_TTL_SECONDS
        ),
        hashBackofficeAuthSecret(nextRefreshToken)
    ]);
    const rotated = await repository.rotateRefreshSession({
        id: session.id,
        currentTokenHash: tokenHash,
        nextTokenHash,
        nextExpiresAt: now + BACKOFFICE_REFRESH_TOKEN_TTL_SECONDS,
        updatedAt: now
    });
    if (!rotated) {
        await repository.revokeRefreshSession(session.id, now);
        return rejectRefresh(c, '刷新令牌已失效');
    }

    setBackofficeAuthenticationCookies(c, {
        accessToken,
        refreshToken: nextRefreshToken,
        csrfSecret
    });
    return c.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            producername: user.producername || '',
            dept: user.dept,
            adminRole: user.admin_role
        }
    });
}
