import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    ACCESS_TOKEN_TTL_SECONDS,
    REFRESH_TOKEN_TTL_SECONDS,
    accessTokenClaims,
    clearAuthenticationCookies,
    hashAuthSecret,
    hasValidRefreshCsrf,
    setAuthenticationCookies
} from '@/domains/auth/auth-session';
import { parseAuthenticationCookieRequest } from '@/domains/auth/request';
import type {
    RefreshErrorResponse,
    RefreshSuccessResponse
} from '@/domains/auth/response';
import { authRepository, services } from '@/middleware/hono-context';
import { constantTimeEqual } from '@/utils/crypto/constant-time';
import { randomHex } from '@/utils/crypto/random';

function rejectRefresh(c: Context<AppEnvironment>, message: string): Response {
    clearAuthenticationCookies(c);
    return c.json({ success: false, message } satisfies RefreshErrorResponse, 401);
}

export async function handleRefresh(c: Context<AppEnvironment>): Promise<Response> {
    const request = parseAuthenticationCookieRequest(c);
    const refreshToken = request.refreshToken;
    if (!refreshToken) return rejectRefresh(c, '刷新令牌无效');

    const repository = authRepository(c);
    const tokenHash = await hashAuthSecret(refreshToken);
    const session = await repository.findRefreshSessionByTokenHash(tokenHash);
    if (!session) return rejectRefresh(c, '刷新令牌无效');
    if (!await hasValidRefreshCsrf(request, session)) {
        return c.json({
            success: false,
            message: 'CSRF token invalid'
        } satisfies RefreshErrorResponse, 403);
    }

    const now = Math.floor(Date.now() / 1000);
    if (
        session.revoked_at !== null || session.expires_at <= now ||
        !constantTimeEqual(session.token_hash, tokenHash)
    ) {
        await repository.revokeRefreshSession(session.id, now);
        return rejectRefresh(c, '刷新令牌已失效');
    }

    const user = await repository.findUserById(session.user_id);
    if (!user) {
        await repository.revokeRefreshSession(session.id, now);
        return rejectRefresh(c, '刷新令牌无效');
    }

    const runtime = services(c);
    if (!runtime.tokens) throw new Error('Authentication services unavailable');
    const csrfSecret = request.csrfHeader;
    const nextRefreshToken = randomHex(32);
    const [accessToken, nextTokenHash] = await Promise.all([
        runtime.tokens.sign(accessTokenClaims(user, csrfSecret), ACCESS_TOKEN_TTL_SECONDS),
        hashAuthSecret(nextRefreshToken)
    ]);
    const rotated = await repository.rotateRefreshSession({
        id: session.id,
        currentTokenHash: tokenHash,
        nextTokenHash,
        nextExpiresAt: now + REFRESH_TOKEN_TTL_SECONDS,
        updatedAt: now
    });
    if (!rotated) {
        await repository.revokeRefreshSession(session.id, now);
        return rejectRefresh(c, '刷新令牌已失效');
    }

    setAuthenticationCookies(c, {
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
    } satisfies RefreshSuccessResponse);
}
