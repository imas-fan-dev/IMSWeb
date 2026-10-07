import type { PlatformSessionListResponse } from '@imsweb/contracts/platform/account-security';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { platformSessionDeviceView } from '@/domains/identity/platform-account-security/sessions/session-device-view';
import { platformAccountRepository } from '@/middleware/hono-context';

export async function handleListPlatformSessions(
    c: Context<AppEnvironment>
): Promise<Response> {
    const claims = c.get('platformUser')!;
    const sessions = await platformAccountRepository(c)
        .listRefreshSessionsByAccount(claims.id, Date.now());
    const payload: PlatformSessionListResponse = {
        success: true,
        sessions: sessions.map((session) =>
            platformSessionDeviceView(session, claims.sessionId))
    };
    return c.json(payload);
}
