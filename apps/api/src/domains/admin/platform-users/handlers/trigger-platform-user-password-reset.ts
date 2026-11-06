import type {
    AdminPlatformUserPasswordResetResponse,
    AdminPlatformUserIdParams,
    AdminPlatformUserPasswordResetUnavailableError
} from '@imsweb/contracts/platform/admin-users';
import type { PlatformRetryableAuthError } from '@imsweb/contracts/platform';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import {
    ADMIN_PLATFORM_USER_ACTIONS,
    ADMIN_PLATFORM_USER_RESULTS,
    platformUserAuditTarget
} from '@/domains/admin/platform-users/audit-actions';
import {
    platformUserNotFound,
    platformUserPasswordResetUnavailable,
    platformUserSuspended
} from '@/domains/admin/platform-users/errors';
import { findAdminPlatformUser } from '@/domains/admin/platform-users/find-platform-user';
import { issuePlatformPasswordReset } from '@/domains/identity/platform-auth/password-reset/issue-password-reset';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleTriggerAdminPlatformUserPasswordReset(
    c: ValidatedRequestContext<AppEnvironment, 'param', AdminPlatformUserIdParams>
): Promise<Response> {
    const { id } = c.req.valid('param');
    const record = await findAdminPlatformUser(c, id);
    if (!record) return platformUserNotFound(c);
    // `completePasswordReset` only accepts active/restricted accounts. Letting a
    // suspended account reach issuance would send an email whose link can never
    // complete, so it is refused before a code exists.
    if (record.status === 'suspended') return platformUserSuspended(c);
    // An OAuth-only account has no password to reset.
    if (record.normalized_email === null) {
        return platformUserPasswordResetUnavailable(c);
    }
    const result = await issuePlatformPasswordReset(c, record.normalized_email);
    if (result.status === 'cooldown') {
        c.header('Retry-After', String(result.retryAfterSeconds));
        return c.json(
            {
                success: false,
                code: 'PLATFORM_PASSWORD_RESET_COOLDOWN',
                retryAfterSeconds: result.retryAfterSeconds
            } satisfies PlatformRetryableAuthError,
            429
        );
    }
    if (result.status === 'unavailable') {
        return c.json(
            {
                success: false,
                code: 'PLATFORM_USER_PASSWORD_RESET_UNAVAILABLE'
            } satisfies AdminPlatformUserPasswordResetUnavailableError,
            503
        );
    }
    await writeAudit(
        c,
        ADMIN_PLATFORM_USER_ACTIONS.passwordReset,
        platformUserAuditTarget(id, ADMIN_PLATFORM_USER_RESULTS.resetQueued)
    );
    const payload: AdminPlatformUserPasswordResetResponse = {
        success: true,
        queued: true,
        retryAfterSeconds: result.retryAfterSeconds
    };
    return c.json(payload, 202);
}
