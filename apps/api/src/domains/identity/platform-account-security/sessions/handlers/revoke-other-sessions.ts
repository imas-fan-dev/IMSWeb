import type { PlatformSessionRevocationResponse } from '@imsweb/contracts/platform/account-security';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { platformSecurityEvent } from '@/domains/identity/platform-auth/contracts/session';
import { platformAccountRepository } from '@/middleware/hono-context';

// "Sign out everywhere else". The caller's own session is kept: they just
// proved control of it, and dropping it would log them out of the very page
// they used to secure the account.
export async function handleRevokeOtherPlatformSessions(
    c: Context<AppEnvironment>
): Promise<Response> {
    const claims = c.get('platformUser')!;
    const revokedSessionCount = await platformAccountRepository(c)
        .revokeAllRefreshSessionsExcept({
            accountId: claims.id,
            keepSessionId: claims.sessionId,
            revokedAt: Date.now(),
            event: platformSecurityEvent(
                c,
                claims.id,
                'auth.session.revoked',
                'other_sessions_revoked_by_owner'
            )
        });
    const payload: PlatformSessionRevocationResponse = {
        success: true,
        revokedSessionCount
    };
    return c.json(payload);
}
