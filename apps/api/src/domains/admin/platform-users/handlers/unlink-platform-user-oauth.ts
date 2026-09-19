import type {
    AdminPlatformUserOAuthProviderParams,
    AdminPlatformUserOAuthUnlinkResponse
} from '@imsweb/contracts/platform/admin-users';
import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import {
    ADMIN_PLATFORM_USER_ACTIONS,
    ADMIN_PLATFORM_USER_RESULTS,
    platformUserAuditTarget
} from '@/domains/admin/platform-users/audit-actions';
import {
    platformOAuthLastLoginMethod,
    platformOAuthLinkNotFound,
    platformUserNotFound
} from '@/domains/admin/platform-users/errors';
import { findAdminPlatformUser } from '@/domains/admin/platform-users/find-platform-user';
import { platformSecurityEvent } from '@/domains/identity/platform-auth/contracts/session';
import { platformAccountRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleUnlinkAdminPlatformUserOAuth(
    c: ValidatedRequestContext<
        AppEnvironment,
        'param',
        AdminPlatformUserOAuthProviderParams
    >
): Promise<Response> {
    const { id, provider } = c.req.valid('param');
    const record = await findAdminPlatformUser(c, id);
    if (!record) return platformUserNotFound(c);
    // `deleteOAuthIdentity` owns the last-credential rule inside its DELETE
    // predicate, so the admin surface cannot place an account into a state with
    // no way back in even through concurrent unlinks.
    const result = await platformAccountRepository(c).deleteOAuthIdentity({
        accountId: id,
        providerCode: provider,
        event: platformSecurityEvent(c, id, 'auth.oauth.unlinked', 'oauth_unlinked_by_admin')
    });
    if (result.status === 'not-found') return platformOAuthLinkNotFound(c);
    if (result.status === 'last-login-method') {
        // A policy refusal is still an operator action worth recording.
        await writeAudit(
            c,
            ADMIN_PLATFORM_USER_ACTIONS.unlinkOAuth,
            platformUserAuditTarget(
                id,
                ADMIN_PLATFORM_USER_RESULTS.oauthUnlinkRefusedLastCredential
            )
        );
        return platformOAuthLastLoginMethod(c);
    }
    await writeAudit(
        c,
        ADMIN_PLATFORM_USER_ACTIONS.unlinkOAuth,
        platformUserAuditTarget(id, ADMIN_PLATFORM_USER_RESULTS.oauthUnlinked)
    );
    const payload: AdminPlatformUserOAuthUnlinkResponse = {
        success: true,
        provider
    };
    return c.json(payload);
}
