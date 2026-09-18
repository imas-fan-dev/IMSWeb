import {
    createOAuthPkcePair,
    hashOAuthStateValue
} from '@/domains/identity/platform-auth/contracts/oauth-pkce';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { platformAccountRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

const OAUTH_LINK_STATE_TTL_MS = 10 * 60_000;
// Fixed on the server, never accepted from the client: the binding round trip
// has no open-redirect surface, and the account-security page is the only place
// the result can be acted on.
const OAUTH_LINK_RETURN_PATH = '/account/security';

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
 * Starts an OAuth link round trip for the signed-in account.
 *
 * The state row carries `intent='link'` and `linking_account_id`, which is what
 * lets the shared anonymous callback pick the binding branch instead of the
 * login branch. `listProviders()` already filters to enabled, fully configured
 * providers, so a disabled provider cannot start a link.
 */
export async function handleStartPlatformOAuthLink(
    c: ValidatedRequestContext<AppEnvironment, 'param', { provider: string | undefined }>
): Promise<Response> {
    const claims = c.get('platformUser')!;
    const providerCode = c.req.valid('param').provider;
    const oauth = services(c).platformOAuth;
    const provider = providerCode && oauth
        ? (await oauth.listProviders()).find(
            (candidate) => candidate.code === providerCode
        ) ?? null
        : null;
    if (!oauth || !provider) {
        return redirectToAccountSecurity(c, 'link-unavailable');
    }

    const pair = createOAuthPkcePair();
    // Build the provider URL before persisting the state: a provider that
    // cannot produce an authorization URL must not leave an orphaned row.
    const authorizationUrl = await oauth.createAuthorizationUrl(provider.code, {
        state: pair.state,
        codeChallenge: pair.challenge
    });
    if (!authorizationUrl) {
        return redirectToAccountSecurity(c, 'link-unavailable');
    }

    const createdAt = Date.now();
    await platformAccountRepository(c).createOAuthState({
        stateHash: hashOAuthStateValue(pair.state),
        providerCode: provider.code,
        intent: 'link',
        linkingAccountId: claims.id,
        clientTarget: 'web',
        appCodeChallenge: null,
        codeVerifier: pair.verifier,
        returnPath: OAUTH_LINK_RETURN_PATH,
        expiresAt: createdAt + OAUTH_LINK_STATE_TTL_MS,
        createdAt
    });
    c.header('Cache-Control', 'no-store');
    return c.redirect(authorizationUrl.toString(), 303);
}
