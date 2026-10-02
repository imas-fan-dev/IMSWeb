import type { PlatformSessionDevice } from '@imsweb/contracts/platform/account-security';
import type { PlatformRefreshSessionRecord } from '@/ports/repositories';

/**
 * The only projection of a refresh session that may leave the server.
 *
 * `token_hash`, `previous_token_hash` and `csrf_hash` are session-bearer
 * secrets: leaking them turns a device list into a credential dump. They are
 * omitted here by construction rather than deleted afterwards, and the contract
 * schema is strict so a future field cannot slip through unnoticed.
 */
export function platformSessionDeviceView(
    session: PlatformRefreshSessionRecord,
    currentSessionId: string
): PlatformSessionDevice {
    return {
        id: session.id,
        current: session.id === currentSessionId,
        userAgent: session.user_agent,
        ipAddress: session.ip_address,
        createdAt: session.created_at,
        lastSeenAt: session.last_seen_at,
        expiresAt: session.expires_at
    };
}
