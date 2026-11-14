import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    createOAuthPkcePair,
    hashOAuthStateValue
} from '@/domains/identity/platform-auth/contracts/oauth-pkce';
import { platformAccountRepository, services } from '@/middleware/hono-context';
import type { PlatformOAuthClientTarget } from '@/ports/repositories';

const OAUTH_LINK_STATE_TTL_MS = 10 * 60_000;
// Fixed on the server, never accepted from the client: the binding round trip
// has no open-redirect surface, and the account-security page is the only place
// the result can be acted on.
export const OAUTH_LINK_RETURN_PATH = '/account/security';

export interface StartOAuthLinkRoundTripInput {
    providerCode: string | undefined;
    linkingAccountId: string;
    clientTarget: PlatformOAuthClientTarget;
    appCodeChallenge: string | null;
}

export type StartOAuthLinkRoundTripResult =
    | { status: 'started'; authorizationUrl: URL }
    | { status: 'unavailable' };

/**
 * Shared start core for both link transports.
 *
 * The Web GET and the packaged-app POST differ only in who receives the
 * provider URL and which return channel the state row records: `web` comes back
 * to account security through the browser, `app` hands the callback a one-time
 * code through the custom-scheme deep link. Resolving the provider, minting the
 * server-side PKCE pair, building the authorization URL, and persisting the
 * state row are identical, so they live here rather than in either handler.
 *
 * `listProviders()` already filters to enabled, fully configured providers, so
 * a disabled provider cannot start a link.
 */
export async function startOAuthLinkRoundTrip(
    c: Context<AppEnvironment>,
    input: StartOAuthLinkRoundTripInput
): Promise<StartOAuthLinkRoundTripResult> {
    const oauth = services(c).platformOAuth;
    const provider = input.providerCode && oauth
        ? (await oauth.listProviders()).find(
            (candidate) => candidate.code === input.providerCode
        ) ?? null
        : null;
    if (!oauth || !provider) {
        return { status: 'unavailable' };
    }

    const pair = createOAuthPkcePair();
    // Build the provider URL before persisting the state: a provider that
    // cannot produce an authorization URL must not leave an orphaned row.
    const authorizationUrl = await oauth.createAuthorizationUrl(provider.code, {
        state: pair.state,
        codeChallenge: pair.challenge
    });
    if (!authorizationUrl) {
        return { status: 'unavailable' };
    }

    const createdAt = Date.now();
    await platformAccountRepository(c).createOAuthState({
        stateHash: hashOAuthStateValue(pair.state),
        providerCode: provider.code,
        intent: 'link',
        linkingAccountId: input.linkingAccountId,
        clientTarget: input.clientTarget,
        appCodeChallenge: input.appCodeChallenge,
        codeVerifier: pair.verifier,
        returnPath: OAUTH_LINK_RETURN_PATH,
        expiresAt: createdAt + OAUTH_LINK_STATE_TTL_MS,
        createdAt
    });
    return { status: 'started', authorizationUrl };
}
