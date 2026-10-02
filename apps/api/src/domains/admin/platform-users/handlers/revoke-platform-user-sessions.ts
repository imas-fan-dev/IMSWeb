import type { AdminPlatformUserIdParams } from '@imsweb/contracts/platform/admin-users';
import type { AdminPlatformUserSessionRevocationResponse } from '@imsweb/contracts/platform/admin-users';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import {
    ADMIN_PLATFORM_USER_ACTIONS,
    ADMIN_PLATFORM_USER_RESULTS,
    platformUserAuditTarget
} from '@/domains/admin/platform-users/audit-actions';
import { platformUserNotFound } from '@/domains/admin/platform-users/errors';
import { platformSecurityEvent } from '@/domains/identity/platform-auth/contracts/session';
import { platformAccountRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleRevokeAdminPlatformUserSessions(
    c: ValidatedRequestContext<AppEnvironment, 'param', AdminPlatformUserIdParams>
): Promise<Response> {
    const { id } = c.req.valid('param');
    // Force logout is the two halves of an immediate revocation in one batch:
    // the version bump kills live access tokens, the sweep kills refresh
    // sessions. Nothing here keeps a session, because the admin console has no
    // platform session of its own. A repeat call is idempotent and reports 0.
    const result = await platformAccountRepository(c).forceLogoutPlatformAccount({
        accountId: id,
        revokedAt: Date.now(),
        event: platformSecurityEvent(c, id, 'auth.session.revoked', 'revoked_by_admin')
    });
    if (result.status === 'not-found') return platformUserNotFound(c);
    await writeAudit(
        c,
        ADMIN_PLATFORM_USER_ACTIONS.forceLogout,
        platformUserAuditTarget(id, ADMIN_PLATFORM_USER_RESULTS.sessionsRevoked)
    );
    const payload: AdminPlatformUserSessionRevocationResponse = {
        success: true,
        revokedSessionCount: result.revokedSessionCount
    };
    return c.json(payload);
}
