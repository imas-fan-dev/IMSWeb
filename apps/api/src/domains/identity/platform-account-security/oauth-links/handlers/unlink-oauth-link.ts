import type { PlatformOAuthUnlinkResponse } from '@imsweb/contracts/platform/account-security';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { parsePlatformOAuthProviderCode } from '@/domains/identity/platform-account-security/oauth-links/request';
import { platformSecurityEvent } from '@/domains/identity/platform-auth/contracts/session';
import { platformAccountRepository } from '@/middleware/hono-context';

/**
 * An unknown provider, a provider the caller never linked, and a link that
 * belongs to somebody else all answer identically. Splitting them apart would
 * let any signed-in user enumerate which providers exist and which accounts
 * use them, one request at a time.
 */
function linkNotFound(c: Context<AppEnvironment>): Response {
    return c.json({ success: false, code: 'PLATFORM_OAUTH_LINK_NOT_FOUND' }, 404);
}

export async function handleUnlinkPlatformOAuthLink(
    c: Context<AppEnvironment>
): Promise<Response> {
    const claims = c.get('platformUser')!;
    const providerCode = parsePlatformOAuthProviderCode(c.req.param('provider'));
    if (!providerCode) return linkNotFound(c);
    // The account id goes into the statement's WHERE clause, so ownership is
    // enforced by the write itself rather than by a read-then-write gap.
    const result = await platformAccountRepository(c).deleteOAuthIdentity({
        accountId: claims.id,
        providerCode,
        event: platformSecurityEvent(
            c,
            claims.id,
            'auth.oauth.unlinked',
            'oauth_unlinked_by_owner'
        )
    });
    if (result.status === 'not-found') return linkNotFound(c);
    if (result.status === 'last-login-method') {
        // 409, matching how this domain already reports "the account state does
        // not permit this write" for password changes. It is not 403: nothing
        // about the caller's authority is lacking, and it is not 404: the link
        // is there. The distinct code is what lets the client say "this is your
        // last way to sign in" instead of a generic failure.
        return c.json(
            { success: false, code: 'PLATFORM_OAUTH_LAST_LOGIN_METHOD' },
            409
        );
    }
    const payload: PlatformOAuthUnlinkResponse = {
        success: true,
        provider: providerCode
    };
    return c.json(payload);
}
