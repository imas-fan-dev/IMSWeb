import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    clearAuthenticationCookies,
    hashAuthSecret,
    hasValidRefreshCsrf,
    refreshTokenCookie
} from '@/domains/auth/auth-session';
import { authRepository } from '@/middleware/hono-context';

export async function handleLogout(c: Context<AppEnvironment>): Promise<Response> {
    const refreshToken = refreshTokenCookie(c);
    if (refreshToken) {
        const repository = authRepository(c);
        const session = await repository.findRefreshSessionByTokenHash(
            await hashAuthSecret(refreshToken)
        );
        if (session) {
            if (!await hasValidRefreshCsrf(c, session)) {
                return c.json({ success: false, message: 'CSRF token invalid' }, 403);
            }
            await repository.revokeRefreshSession(
                session.id,
                Math.floor(Date.now() / 1000)
            );
        }
    }
    clearAuthenticationCookies(c);
    return c.json({ success: true });
}
