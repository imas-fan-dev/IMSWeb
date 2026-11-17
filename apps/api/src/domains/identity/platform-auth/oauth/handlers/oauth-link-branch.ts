import { APP_OAUTH_CALLBACK_URL } from '@imsweb/contracts/paths';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { platformSecurityEvent } from '@/domains/identity/platform-auth/contracts/session';
import { mintPlatformOAuthExchangeCode } from '@/domains/identity/platform-auth/oauth/oauth-exchange-code';
import { platformAccountRepository } from '@/middleware/hono-context';
import type { PlatformOAuthClient, PlatformOAuthProviderSummary } from '@/ports/oauth';
import type { PlatformOAuthStateRecord } from '@/ports/repositories';

/**
 * OAuth account-linking callback branch.
 *
 * The callback dispatches here only when the consumed state row carries
 * `intent === 'link'`, so a login state can never reach the binding code. This
 * branch never creates an account and never establishes a session: it proves
 * the caller owns the provider subject (through the state row's PKCE verifier),
 * attaches that subject to `linking_account_id`, and returns to the account
 * security page with a reason.
 *
 * `client_target` picks the return channel. A Web state returns to
 * `/account/security?oauth=...`; an app state cannot carry a cookie back through
 * a document redirect, so a successful link mints the same one-time exchange
 * code the login app branch uses and hands it to the custom-scheme deep link.
 *
 * Conflict policy is deliberately narrow. An identity that already belongs to
 * another account is refused with `link-conflict` and no row is written; the
 * two accounts are never merged. An identity this account already owns is an
 * idempotent `linked`. `provider-conflict` means this account already links a
 * different subject for that provider and must unlink it first.
 */

export interface PlatformOAuthLinkCallbackInput {
    provider: PlatformOAuthProviderSummary;
    oauth: PlatformOAuthClient;
    state: PlatformOAuthStateRecord;
    code: string;
}

/**
 * The app return channel, whether the round trip succeeded or failed. Always
 * stamps `flow=link` so the app can tell a binding callback from a login one;
 * the login branch returns `client_target: 'app'` without a flow key.
 */
export function redirectToPlatformOAuthLinkApp(
    c: Context<AppEnvironment>,
    value: string,
    key: 'code' | 'error' = 'code',
): Response {
    const query = new URLSearchParams({ [key]: value, flow: 'link' }).toString();
    c.header('Cache-Control', 'no-store');
    return c.redirect(`${APP_OAUTH_CALLBACK_URL}?${query}`, 303);
}

export function redirectToPlatformOAuthLink(
    c: Context<AppEnvironment>,
    state: PlatformOAuthStateRecord,
    reason: string,
): Response {
    if (state.client_target === 'app') {
        return redirectToPlatformOAuthLinkApp(c, reason, 'error');
    }
    const destination = new URL(state.return_path, c.req.url);
    destination.searchParams.set('oauth', reason);
    c.header('Cache-Control', 'no-store');
    return c.redirect(destination.toString(), 303);
}

/**
 * Mints the one-time code for an app link success. An app row that somehow
 * lacks a challenge cannot be redeemed, so it falls back to the error channel
 * rather than writing a code no app could use.
 */
async function redirectToPlatformOAuthLinkedApp(
    c: Context<AppEnvironment>,
    state: PlatformOAuthStateRecord,
): Promise<Response> {
    const challenge = state.app_code_challenge;
    const accountId = state.linking_account_id;
    if (!challenge || !accountId) {
        return redirectToPlatformOAuthLinkApp(c, 'link-failed', 'error');
    }
    const code = await mintPlatformOAuthExchangeCode(c, {
        accountId,
        codeChallenge: challenge
    });
    return redirectToPlatformOAuthLinkApp(c, code);
}

export async function handlePlatformOAuthLinkCallback(
    c: Context<AppEnvironment>,
    input: PlatformOAuthLinkCallbackInput,
): Promise<Response> {
    const accountId = input.state.linking_account_id;
    // Defense in depth: the database CHECK already requires a link row to carry
    // an account, and the callback only routes `intent === 'link'` rows here.
    // Re-checking keeps a malformed or hand-crafted row from silently binding
    // to nothing.
    if (input.state.intent !== 'link' || !accountId) {
        return redirectToPlatformOAuthLink(c, input.state, 'link-invalid');
    }
    if (!input.state.code_verifier) {
        return redirectToPlatformOAuthLink(c, input.state, 'link-expired');
    }

    const profile = await input.oauth.exchangeAuthorizationCode(input.provider.code, {
        code: input.code,
        codeVerifier: input.state.code_verifier,
    });
    const now = Date.now();
    const result = await platformAccountRepository(c).createOAuthIdentityForAccount({
        accountId,
        providerCode: profile.providerCode,
        providerSubject: profile.subject,
        providerDisplayName: profile.displayName,
        providerAvatarUrl: profile.avatarUrl ?? '',
        createdAt: now,
        updatedAt: now,
        // The event and the identity live in one batch inside the repository, so
        // the audit row exists only when the link was actually written.
        event: platformSecurityEvent(c, accountId, 'auth.oauth.linked', 'oauth_linked_by_owner'),
    });
    if (result.status === 'created' || result.status === 'already-linked') {
        return input.state.client_target === 'app'
            ? await redirectToPlatformOAuthLinkedApp(c, input.state)
            : redirectToPlatformOAuthLink(c, input.state, 'linked');
    }
    if (result.status === 'identity-conflict') {
        return redirectToPlatformOAuthLink(c, input.state, 'link-conflict');
    }
    if (result.status === 'provider-conflict') {
        return redirectToPlatformOAuthLink(c, input.state, 'link-already-bound');
    }
    // `not-found` means the linking account is no longer active. The provider
    // round trip must not strand the user on a dead deep link.
    return redirectToPlatformOAuthLink(c, input.state, 'link-unavailable');
}
