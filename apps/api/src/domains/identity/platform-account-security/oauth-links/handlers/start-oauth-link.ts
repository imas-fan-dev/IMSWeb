import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    OAUTH_LINK_RETURN_PATH,
    startOAuthLinkRoundTrip
} from '@/domains/identity/platform-account-security/oauth-links/oauth-link-round-trip';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

function redirectToAccountSecurity(
    c: Context<AppEnvironment>,
    reason: string,
): Response {
    const destination = new URL(OAUTH_LINK_RETURN_PATH, c.req.url);
    destination.searchParams.set('oauth', reason);
    c.header('Cache-Control', 'no-store');
    return c.redirect(destination.toString(), 303);
}

/**
 * Starts an OAuth link round trip for the signed-in account through the
 * browser.
 *
 * The state row carries `intent='link'` and `linking_account_id`, which is what
 * lets the shared anonymous callback pick the binding branch instead of the
 * login branch. This is the Web transport; the packaged app starts the same
 * round trip through `start-oauth-link-app.ts` and returns by deep link. Both
 * share `oauth-link-round-trip.ts`, so the provider lookup, PKCE pair, and
 * state write cannot drift between them.
 */
export async function handleStartPlatformOAuthLink(
    c: ValidatedRequestContext<AppEnvironment, 'param', { provider: string | undefined }>
): Promise<Response> {
    const claims = c.get('platformUser')!;
    const result = await startOAuthLinkRoundTrip(c, {
        providerCode: c.req.valid('param').provider,
        linkingAccountId: claims.id,
        clientTarget: 'web',
        appCodeChallenge: null
    });
    if (result.status === 'unavailable') {
        return redirectToAccountSecurity(c, 'link-unavailable');
    }
    c.header('Cache-Control', 'no-store');
    return c.redirect(result.authorizationUrl.toString(), 303);
}
