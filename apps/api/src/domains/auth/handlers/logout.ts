import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    clearAuthenticationCookies,
    hashAuthSecret,
    hasValidRefreshCsrf
} from '@/domains/auth/auth-session';
import { parseAuthenticationCookieRequest } from '@/domains/auth/request';
import type {
    LogoutErrorResponse,
    LogoutSuccessResponse
} from '@/domains/auth/response';
import { authRepository } from '@/middleware/hono-context';

export async function handleLogout(c: Context<AppEnvironment>): Promise<Response> {
    const request = parseAuthenticationCookieRequest(c);
    const refreshToken = request.refreshToken;
    if (refreshToken) {
        const repository = authRepository(c);
        const session = await repository.findRefreshSessionByTokenHash(
            await hashAuthSecret(refreshToken)
        );
        if (session) {
            if (!await hasValidRefreshCsrf(request, session)) {
                return c.json({
                    success: false,
                    message: 'CSRF token invalid'
                } satisfies LogoutErrorResponse, 403);
            }
            await repository.revokeRefreshSession(
                session.id,
                Math.floor(Date.now() / 1000)
            );
        }
    }
    clearAuthenticationCookies(c);
    return c.json({ success: true } satisfies LogoutSuccessResponse);
}
