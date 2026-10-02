/**
 * The `logs.action` vocabulary for platform-user administration.
 *
 * `logs.action` is a free string with no CHECK constraint, so the module-level
 * constants are what keep the five actions searchable instead of drifting into
 * synonyms. `logs` has no result column either: the outcome is encoded as a
 * stable `result=<token>` suffix on `target`, and the structured account-side
 * event is written inside the same transaction through
 * `platform_security_events`.
 */
export const ADMIN_PLATFORM_USER_ACTIONS = {
    suspend: '禁用平台用户',
    reactivate: '启用平台用户',
    forceLogout: '强制下线平台用户',
    passwordReset: '触发平台用户密码重置',
    unlinkOAuth: '解绑平台用户 OAuth'
} as const;

export const ADMIN_PLATFORM_USER_RESULTS = {
    suspended: 'suspended',
    reactivated: 'reactivated',
    sessionsRevoked: 'sessions_revoked',
    resetQueued: 'reset_queued',
    oauthUnlinked: 'oauth_unlinked',
    oauthUnlinkRefusedLastCredential: 'oauth_unlink_refused_last_credential'
} as const;

export function platformUserAuditTarget(
    accountId: string,
    result: string
): string {
    return `platform_user=${accountId};result=${result}`;
}
