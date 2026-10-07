import type {
    AdminPlatformUser,
    AdminPlatformUserDetail
} from '@imsweb/contracts/platform/admin-users';
import { platformOAuthLinkViews } from '@/domains/identity/platform-account-security/oauth-links/oauth-link-view';
import type {
    PlatformAccountAdminRecord,
    PlatformOAuthLinkRecord
} from '@/ports/repositories';

/**
 * The admin projection has no session row, so there is no `token_hash`,
 * `previous_token_hash` or `csrf_hash` here to leak. The mapping is explicit
 * rather than a spread so a future column cannot ride along silently.
 */
export function toAdminPlatformUser(
    record: PlatformAccountAdminRecord
): AdminPlatformUser {
    return {
        id: record.id,
        status: record.status,
        displayName: record.display_name,
        email: record.normalized_email,
        hasPassword: record.has_password,
        activeSessionCount: record.active_session_count,
        lastLoginAt: record.last_login_at,
        createdAt: record.created_at,
        updatedAt: record.updated_at
    };
}

export function toAdminPlatformUserDetail(
    record: PlatformAccountAdminRecord,
    links: readonly PlatformOAuthLinkRecord[]
): AdminPlatformUserDetail {
    return {
        ...toAdminPlatformUser(record),
        // Reusing the identity domain's view keeps `removable` clause-for-clause
        // identical to the DELETE guard inside `deleteOAuthIdentity`.
        oauthLinks: platformOAuthLinkViews(links, record.has_password)
    };
}
