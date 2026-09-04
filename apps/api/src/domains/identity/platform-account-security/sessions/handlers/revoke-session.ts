import type { PlatformSessionRevocationResponse } from '@imsweb/contracts/platform/account-security';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { parsePlatformSessionId } from '@/domains/identity/platform-account-security/sessions/request';
import { platformSecurityEvent } from '@/domains/identity/platform-auth/contracts/session';
import { platformAccountRepository } from '@/middleware/hono-context';

// A session that belongs to another account is reported exactly like one that
// never existed. Separating the two would turn this endpoint into an oracle for
// probing whether a given session id is live somewhere else on the platform.
function sessionNotFound(c: Context<AppEnvironment>): Response {
    return c.json({ success: false, code: 'PLATFORM_SESSION_NOT_FOUND' }, 404);
}

export async function handleRevokePlatformSession(
    c: Context<AppEnvironment>
): Promise<Response> {
    const claims = c.get('platformUser')!;
    const sessionId = parsePlatformSessionId(c.req.param('id'));
    if (!sessionId) return sessionNotFound(c);
    // The repository statement carries `id=? AND account_id=?`, so ownership is
    // enforced by the write itself rather than by a read-then-write gap.
    const revoked = await platformAccountRepository(c).revokeRefreshSession({
        id: sessionId,
        accountId: claims.id,
        revokedAt: Date.now(),
        event: platformSecurityEvent(
            c,
            claims.id,
            'auth.session.revoked',
            'session_revoked_by_owner'
        )
    });
    if (!revoked) return sessionNotFound(c);
    const payload: PlatformSessionRevocationResponse = {
        success: true,
        revokedSessionCount: 1
    };
    return c.json(payload);
}
