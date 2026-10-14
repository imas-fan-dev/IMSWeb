import type {
    AdminPlatformUserConflictError,
    AdminPlatformUserStatusResponse
} from '@imsweb/contracts/platform/admin-users';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import {
    ADMIN_PLATFORM_USER_ACTIONS,
    ADMIN_PLATFORM_USER_RESULTS,
    platformUserAuditTarget
} from '@/domains/admin/platform-users/audit-actions';
import {
    platformUserNotFound,
    platformUserStatusUnsupported
} from '@/domains/admin/platform-users/errors';
import type { AdminPlatformUserStatusRequestContext } from '@/domains/admin/platform-users/request';
import { toAdminPlatformUser } from '@/domains/admin/platform-users/response';
import { platformSecurityEvent } from '@/domains/identity/platform-auth/contracts/session';
import { platformAccountRepository } from '@/middleware/hono-context';

export async function handleUpdateAdminPlatformUserStatus(
    c: AdminPlatformUserStatusRequestContext
): Promise<Response> {
    const { id } = c.req.valid('param');
    const { status, expectedUpdatedAt } = c.req.valid('json');
    // Suspension and reactivation are the two account-side events the admin
    // surface can produce; the event row is written in the same batch as the
    // status write, so the audit trail cannot diverge from the state.
    const result = await platformAccountRepository(c).setPlatformAccountStatus({
        accountId: id,
        status,
        expectedUpdatedAt,
        updatedAt: Date.now(),
        event: platformSecurityEvent(
            c,
            id,
            status === 'suspended'
                ? 'auth.account_blocked'
                : 'auth.account.reactivated',
            status === 'suspended'
                ? 'suspended_by_admin'
                : 'reactivated_by_admin'
        )
    });
    if (result.status === 'not-found') return platformUserNotFound(c);
    if (result.status === 'unsupported') return platformUserStatusUnsupported(c);
    if (result.status === 'conflict') {
        return c.json(
            {
                success: false,
                code: 'REVISION_CONFLICT',
                user: toAdminPlatformUser(result.account)
            } satisfies AdminPlatformUserConflictError,
            409
        );
    }
    // Setting the status it already has is a no-op: no write, no version bump,
    // no audit line.
    if (result.changed) {
        await writeAudit(
            c,
            status === 'suspended'
                ? ADMIN_PLATFORM_USER_ACTIONS.suspend
                : ADMIN_PLATFORM_USER_ACTIONS.reactivate,
            platformUserAuditTarget(
                id,
                status === 'suspended'
                    ? ADMIN_PLATFORM_USER_RESULTS.suspended
                    : ADMIN_PLATFORM_USER_RESULTS.reactivated
            )
        );
    }
    const payload: AdminPlatformUserStatusResponse = {
        success: true,
        user: toAdminPlatformUser(result.account)
    };
    return c.json(payload);
}
