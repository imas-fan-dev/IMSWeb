import { createHash, randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { PlatformOAuthProviderCode, PlatformOAuthProviderSummary } from '@/ports/oauth';
import { establishPlatformSession } from '@/domains/identity/platform-auth/contracts/session';
import { platformAccountRepository, services } from '@/middleware/hono-context';

const OAUTH_STATE_TTL_MS = 10 * 60_000;
const DEFAULT_RETURN_PATH = '/community/exchange/me';
const PROVIDER_CODE = /^[a-z][a-z0-9-]{0,31}$/;

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

function hashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function createPkcePair(): {
    state: string;
    verifier: string;
    challenge: string;
} {
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { state, verifier, challenge };
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
    return c.json({ success: true, providers });
}

export async function handlePlatformOAuthStart(c: Context<AppEnvironment>): Promise<Response> {
    const providerCode = c.req.param('provider');
    const provider = await configuredProvider(c, providerCode);
    const oauth = services(c).platformOAuth;
    if (!provider || !oauth) return redirectToLogin(c, 'unavailable');
    const returnPath = safeReturnPath(c.req.query('returnPath'));
    const pair = createPkcePair();
    const createdAt = Date.now();
    await platformAccountRepository(c).createOAuthState({
        stateHash: hashValue(pair.state),
        providerCode: provider.code,
        intent: 'login',
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

export async function handlePlatformOAuthCallback(c: Context<AppEnvironment>): Promise<Response> {
    const providerCode = c.req.param('provider');
    const provider = await configuredProvider(c, providerCode);
    const oauth = services(c).platformOAuth;
    if (!provider || !oauth) return redirectToLogin(c, 'unavailable');
    const state = c.req.query('state');
    const code = c.req.query('code');
    if (!state || c.req.query('error') || !code || code.length > 4096) {
        return redirectToLogin(c, c.req.query('error') ? 'denied' : 'invalid');
    }
    const consumedState = await platformAccountRepository(c).consumeOAuthState(
        hashValue(state),
        provider.code,
        Date.now(),
    );
    if (!consumedState?.code_verifier) return redirectToLogin(c, 'expired');

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
