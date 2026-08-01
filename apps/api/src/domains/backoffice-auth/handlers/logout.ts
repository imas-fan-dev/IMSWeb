import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    clearBackofficeAuthenticationCookies,
    hashBackofficeAuthSecret,
    hasValidBackofficeRefreshCsrf,
    backofficeRefreshTokenCookie
} from '@/domains/backoffice-auth/backoffice-auth-session';
import { backofficeAuthRepository } from '@/middleware/hono-context';

export async function handleBackofficeLogout(c: Context<AppEnvironment>): Promise<Response> {
    const refreshToken = backofficeRefreshTokenCookie(c);
    if (refreshToken) {
        const repository = backofficeAuthRepository(c);
        const session = await repository.findRefreshSessionByTokenHash(
            await hashBackofficeAuthSecret(refreshToken)
        );
        if (session) {
            if (!await hasValidBackofficeRefreshCsrf(c, session)) {
                return c.json({ success: false, message: 'CSRF token invalid' }, 403);
            }
            await repository.revokeRefreshSession(
                session.id,
                Math.floor(Date.now() / 1000)
            );
        }
    }
    clearBackofficeAuthenticationCookies(c);
    return c.json({ success: true });
}
