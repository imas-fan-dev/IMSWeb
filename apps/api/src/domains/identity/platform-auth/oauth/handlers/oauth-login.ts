import { randomBytes } from 'node:crypto';
import type {
    PlatformOAuthCallbackQuery,
    PlatformOAuthProviderParams,
    PlatformOAuthProvidersResponse,
    PlatformOAuthStartQuery
} from '@imsweb/contracts/platform';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    handlePlatformOAuthLinkCallback,
    redirectToPlatformOAuthLink
} from '@/domains/identity/platform-auth/oauth/handlers/oauth-link-branch';
import {
    handlePlatformOAuthAppCallback,
    redirectToPlatformOAuthApp
} from '@/domains/identity/platform-auth/oauth/handlers/oauth-app-branch';
import type { PlatformOAuthProviderCode, PlatformOAuthProviderSummary } from '@/ports/oauth';
import type { PlatformOAuthClientTarget } from '@/ports/repositories';
import {
    createOAuthPkcePair,
    hashOAuthStateValue
} from '@/domains/identity/platform-auth/contracts/oauth-pkce';
import { establishPlatformSession } from '@/domains/identity/platform-auth/contracts/session';
import { platformAccountRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

const OAUTH_STATE_TTL_MS = 10 * 60_000;
const DEFAULT_RETURN_PATH = '/community/exchange/me';
const PROVIDER_CODE = /^[a-z][a-z0-9-]{0,31}$/;
// The app generates the verifier; only its challenge rides the query string.
const APP_CODE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

function isProviderCode(value: string | undefined): value is PlatformOAuthProviderCode {
    return Boolean(value && PROVIDER_CODE.test(value));
}

function safeReturnPath(value: string | undefined): string {
    const candidate = value?.trim() || DEFAULT_RETURN_PATH;
    if (
        candidate.length > 2048 ||
        !candidate.startsWith('/') ||
        candidate.startsWith('//') ||
        candidate.includes('\\') ||
        /[\u0000-\u001f\u007f]/.test(candidate)
    ) {
        return DEFAULT_RETURN_PATH;
    }
    return candidate;
}

function redirectToLogin(c: Context<AppEnvironment>, reason: string): Response {
    const url = new URL('/account/login', c.req.url);
    url.searchParams.set('oauth', reason);
    return c.redirect(url.toString(), 303);
}

async function configuredProvider(
    c: Context<AppEnvironment>,
    code: string | undefined,
): Promise<PlatformOAuthProviderSummary | null> {
    if (!isProviderCode(code)) return null;
    const oauth = services(c).platformOAuth;
    if (!oauth) return null;
    return (await oauth.listProviders()).find((provider) => provider.code === code) ?? null;
}

export async function handlePlatformOAuthProviders(c: Context<AppEnvironment>): Promise<Response> {
    const oauth = services(c).platformOAuth;
    const providers = oauth ? await oauth.listProviders() : [];
    c.header('Cache-Control', 'private, no-store');
    return c.json({ success: true, providers } satisfies PlatformOAuthProvidersResponse);
}

export async function handlePlatformOAuthStart(
    c: ValidatedRequestContext<AppEnvironment, 'param', PlatformOAuthProviderParams> &
        ValidatedRequestContext<AppEnvironment, 'query', PlatformOAuthStartQuery>
): Promise<Response> {
    const providerCode = c.req.valid('param').provider;
    const provider = await configuredProvider(c, providerCode);
    const oauth = services(c).platformOAuth;
    if (!provider || !oauth) return redirectToLogin(c, 'unavailable');
    const query = c.req.valid('query');
    const returnPath = safeReturnPath(query.returnPath);
    const clientTarget: PlatformOAuthClientTarget =
        query.client === 'app' ? 'app' : 'web';
    let appCodeChallenge: string | null = null;
    if (clientTarget === 'app') {
        if (!query.codeChallenge || !APP_CODE_CHALLENGE.test(query.codeChallenge)) {
            return redirectToLogin(c, 'invalid');
        }
        appCodeChallenge = query.codeChallenge;
    }
    const pair = createOAuthPkcePair();
    const createdAt = Date.now();
    await platformAccountRepository(c).createOAuthState({
        stateHash: hashOAuthStateValue(pair.state),
        providerCode: provider.code,
        intent: 'login',
        linkingAccountId: null,
        clientTarget,
        appCodeChallenge,
        codeVerifier: pair.verifier,
        returnPath,
        expiresAt: createdAt + OAUTH_STATE_TTL_MS,
        createdAt,
    });
    const authorizationUrl = await oauth.createAuthorizationUrl(provider.code, {
        state: pair.state,
        codeChallenge: pair.challenge,
    });
    if (!authorizationUrl) return redirectToLogin(c, 'unavailable');
    c.header('Cache-Control', 'no-store');
    return c.redirect(authorizationUrl.toString(), 303);
}

export async function handlePlatformOAuthCallback(
    c: ValidatedRequestContext<AppEnvironment, 'param', PlatformOAuthProviderParams> &
        ValidatedRequestContext<AppEnvironment, 'query', PlatformOAuthCallbackQuery>
): Promise<Response> {
    const providerCode = c.req.valid('param').provider;
    const provider = await configuredProvider(c, providerCode);
    const oauth = services(c).platformOAuth;
    if (!provider || !oauth) return redirectToLogin(c, 'unavailable');
    const query = c.req.valid('query');
    const state = query.state;
    const code = query.code;
    if (!state || query.error || !code || code.length > 4096) {
        // A provider denial arrives before the state is consumed, so the app
        // can still be told to stop waiting. Every other failure keeps the web
        // login redirect unchanged.
        if (query.error && state) {
            const clientTarget = await platformAccountRepository(
                c,
            ).findOAuthStateClientTarget(
                hashOAuthStateValue(state),
                provider.code,
                Date.now(),
            );
            if (clientTarget === 'app') {
                return redirectToPlatformOAuthApp(c, 'denied', 'error');
            }
        }
        return redirectToLogin(c, query.error ? 'denied' : 'invalid');
    }
    const consumedState = await platformAccountRepository(c).consumeOAuthState(
        hashOAuthStateValue(state),
        provider.code,
        Date.now(),
    );
    if (!consumedState?.code_verifier) return redirectToLogin(c, 'expired');

    // `intent` picks the flow; `client_target` picks the return channel. The
    // link flow lives in its own module so the binding channel owns it, and a
    // login state can only reach it when the consumed row says so.
    if (consumedState.intent === 'link') {
        try {
            return await handlePlatformOAuthLinkCallback(c, {
                provider,
                oauth,
                state: consumedState,
                code,
            });
        } catch {
            return redirectToPlatformOAuthLink(c, consumedState, 'link-failed');
        }
    }

    try {
        const profile = await oauth.exchangeAuthorizationCode(provider.code, {
            code,
            codeVerifier: consumedState.code_verifier,
        });
        let identity = await platformAccountRepository(c).findOAuthIdentity(
            profile.providerCode,
            profile.subject,
        );
        if (!identity) {
            const now = Date.now();
            const created = await platformAccountRepository(c).createOAuthAccount({
                id: randomBytes(16).toString('hex'),
                status: 'active',
                tokenVersion: 0,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
                profile: {
                    displayName: profile.displayName,
                    avatarObjectKey: null,
                    avatarExternalUrl: profile.avatarUrl,
                    homeCity: null,
                    bio: '',
                    updatedAt: now,
                },
                oauth: {
                    providerCode: profile.providerCode,
                    providerSubject: profile.subject,
                    providerDisplayName: profile.displayName,
                    providerAvatarUrl: profile.avatarUrl ?? '',
                    createdAt: now,
                    updatedAt: now,
                },
            });
            identity = created.identity;
        }
        if (consumedState.client_target === 'app') {
            try {
                return await handlePlatformOAuthAppCallback(c, {
                    state: consumedState,
                    identity,
                });
            } catch {
                return redirectToPlatformOAuthApp(c, 'failed', 'error');
            }
        }
        if (!(await establishPlatformSession(c, identity))) {
            return redirectToLogin(c, 'unavailable');
        }
        const destination = new URL(consumedState.return_path, c.req.url);
        destination.searchParams.delete('oauth');
        c.header('Cache-Control', 'no-store');
        return c.redirect(destination.toString(), 303);
    } catch {
        return redirectToLogin(c, 'failed');
    }
}
