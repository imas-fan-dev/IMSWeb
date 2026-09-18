import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { platformSecurityEvent } from '@/domains/identity/platform-auth/contracts/session';
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

export function redirectToPlatformOAuthLink(
    c: Context<AppEnvironment>,
    state: PlatformOAuthStateRecord,
    reason: string,
): Response {
    const destination = new URL(state.return_path, c.req.url);
    destination.searchParams.set('oauth', reason);
    c.header('Cache-Control', 'no-store');
    return c.redirect(destination.toString(), 303);
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
        return redirectToPlatformOAuthLink(c, input.state, 'linked');
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
