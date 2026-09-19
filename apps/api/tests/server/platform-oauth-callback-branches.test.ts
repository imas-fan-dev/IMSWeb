import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'vitest';
import type {
    CreatePlatformOAuthExchangeCodeInput,
    PlatformOAuthIdentity,
    PlatformOAuthStateRecord
} from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';
import { createWikiFixture } from '../wiki/fixture';

/**
 * The OAuth callback grew two dispatch dimensions: `intent` (`login` vs
 * account `link`) and, inside login, `client_target` (`web` vs `app`). The
 * login + web path is the one that runs in production today, so these cases
 * pin its response byte-for-byte next to the two new branches.
 */

const PUBLIC_OAUTH_URL = '/api/platform/auth/oauth';
const AT = 1_775_100_000_000;

const provider = {
    code: 'github',
    displayName: 'GitHub',
    icon: 'github',
    buttonColor: '#24292f'
};

function identity(): PlatformOAuthIdentity {
    return {
        account: {
            id: 'account-1',
            status: 'active',
            token_version: 0,
            created_at: AT,
            updated_at: AT,
            deleted_at: null
        },
        profile: {
            account_id: 'account-1',
            display_name: 'Producer One',
            avatar_object_key: null,
            avatar_external_url: null,
            home_city: null,
            bio: '',
            updated_at: AT
        },
        oauth: {
            provider_code: 'github',
            provider_subject: 'subject-1',
            account_id: 'account-1',
            provider_display_name: 'Producer One',
            provider_avatar_url: '',
            created_at: AT,
            updated_at: AT
        }
    };
}

function state(overrides: Partial<PlatformOAuthStateRecord>): PlatformOAuthStateRecord {
    return {
        state_hash: 'a'.repeat(64),
        provider_code: 'github',
        intent: 'login',
        linking_account_id: null,
        client_target: 'web',
        app_code_challenge: null,
        code_verifier: 'v'.repeat(43),
        return_path: '/account/me',
        expires_at: AT + 60_000,
        created_at: AT,
        ...overrides
    };
}

function configureFixture(
    consumed: PlatformOAuthStateRecord | null,
    linkResult:
        | { status: 'created' | 'already-linked' | 'identity-conflict'; identity: PlatformOAuthIdentity }
        | { status: 'provider-conflict' }
        | { status: 'not-found' } = { status: 'created', identity: identity() }
) {
    const fixture = createWikiFixture();
    const calls = {
        exchangeAuthorizationCode: 0,
        createRefreshSession: 0,
        createOAuthExchangeCode: [] as Array<CreatePlatformOAuthExchangeCodeInput>,
        findOAuthStateReturnChannel: 0,
        createOAuthIdentityForAccount: [] as Array<Record<string, unknown>>
    };
    fixture.services.platformTokens = {
        async sign() {
            return 'signed-access-token';
        },
        async verify() {
            throw new Error('not used');
        }
    };
    fixture.services.platformAccounts = {
        async consumeOAuthState() {
            return consumed;
        },
        async findOAuthStateReturnChannel() {
            calls.findOAuthStateReturnChannel += 1;
            return consumed
                ? {
                    clientTarget: consumed.client_target,
                    intent: consumed.intent
                }
                : null;
        },
        async findOAuthIdentity() {
            return identity();
        },
        async createRefreshSession() {
            calls.createRefreshSession += 1;
            return true;
        },
        async createOAuthIdentityForAccount(input: Record<string, unknown>) {
            calls.createOAuthIdentityForAccount.push(input);
            return linkResult;
        },
        async createOAuthExchangeCode(
            input: CreatePlatformOAuthExchangeCodeInput
        ) {
            calls.createOAuthExchangeCode.push(input);
        }
    } as unknown as RuntimeServices['platformAccounts'];
    fixture.services.platformOAuth = {
        async listProviders() {
            return [provider];
        },
        async createAuthorizationUrl() {
            return new URL('https://github.example.test/authorize');
        },
        async exchangeAuthorizationCode() {
            calls.exchangeAuthorizationCode += 1;
            return {
                providerCode: 'github',
                subject: 'subject-1',
                displayName: 'Producer One',
                avatarUrl: null
            };
        }
    } as unknown as RuntimeServices['platformOAuth'];
    return { fixture, calls };
}

test('login + web keeps the original callback redirect and sets the session cookies', async () => {
    const { fixture, calls } = configureFixture(state({}));

    const response = await fixture.app.request(
        `${PUBLIC_OAUTH_URL}/github/callback?state=state-1&code=provider-code`,
        { redirect: 'manual' }
    );

    assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.pathname, '/account/me');
    assert.equal(location.search, '');
    assert.equal(calls.exchangeAuthorizationCode, 1);
    assert.equal(calls.createRefreshSession, 1);
    const cookies = response.headers.get('set-cookie') ?? '';
    assert.match(cookies, /ims_platform_access=/);
    assert.match(cookies, /ims_platform_refresh=/);
});

test('login + app returns a one-time deep-link code instead of a session', async () => {
    const challenge = 'c'.repeat(43);
    const { fixture, calls } = configureFixture(
        state({ client_target: 'app', app_code_challenge: challenge })
    );

    const response = await fixture.app.request(
        `${PUBLIC_OAUTH_URL}/github/callback?state=state-1&code=provider-code`,
        { redirect: 'manual' }
    );

    assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.protocol, 'imsweb:');
    assert.equal(location.host, 'oauth');
    assert.equal(location.pathname, '/callback');
    const code = location.searchParams.get('code');
    assert.ok(code);
    assert.ok(code.length >= 43);
    assert.equal(calls.createRefreshSession, 0);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(calls.createOAuthExchangeCode.length, 1);
    const exchangeCode = calls.createOAuthExchangeCode[0];
    assert.ok(exchangeCode);
    assert.equal(exchangeCode.codeChallenge, challenge);
    assert.equal(exchangeCode.accountId, 'account-1');

    // Any app on the device may register the scheme, so the deep link carries
    // exactly one parameter. A second one could hand the verifier, the state,
    // or a long-lived credential to a third party.
    assert.deepEqual([...location.searchParams.keys()], ['code']);
    assert.equal(location.searchParams.has('code_verifier'), false);
    assert.equal(location.toString().includes('v'.repeat(43)), false);
    for (const key of [
        'access',
        'accessToken',
        'access_token',
        'refresh',
        'refreshToken',
        'refresh_token',
        'token'
    ]) {
        assert.equal(location.searchParams.has(key), false);
    }

    // 300s against the 600s state TTL is the deliberate one-time window.
    assert.equal(exchangeCode.expiresAt - exchangeCode.createdAt, 300_000);

    // Only the hash is stored; the code in the URL never reaches the database.
    const expectedHash = createHash('sha256').update(code).digest('hex');
    assert.equal(exchangeCode.codeHash, expectedHash);
    assert.notEqual(exchangeCode.codeHash, code);
});

test('a link state binds the identity and never creates a session', async () => {
    const { fixture, calls } = configureFixture(
        state({
            intent: 'link',
            linking_account_id: 'account-1',
            return_path: '/account/security'
        })
    );

    const response = await fixture.app.request(
        `${PUBLIC_OAUTH_URL}/github/callback?state=state-1&code=provider-code`,
        { redirect: 'manual' }
    );

    assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.pathname, '/account/security');
    assert.equal(location.searchParams.get('oauth'), 'linked');
    assert.equal(calls.exchangeAuthorizationCode, 1);
    assert.equal(calls.createOAuthIdentityForAccount.length, 1);
    assert.equal(
        calls.createOAuthIdentityForAccount[0]?.accountId,
        'account-1'
    );
    assert.equal(calls.createRefreshSession, 0);
    assert.equal(response.headers.get('set-cookie'), null);
});

test('re-linking the same subject is an idempotent success', async () => {
    const { fixture, calls } = configureFixture(
        state({ intent: 'link', linking_account_id: 'account-1' }),
        { status: 'already-linked', identity: identity() }
    );

    const response = await fixture.app.request(
        `${PUBLIC_OAUTH_URL}/github/callback?state=state-1&code=provider-code`,
        { redirect: 'manual' }
    );

    assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.searchParams.get('oauth'), 'linked');
    assert.equal(calls.createRefreshSession, 0);
});

test('a subject owned by another account is refused without a session', async () => {
    const { fixture, calls } = configureFixture(
        state({ intent: 'link', linking_account_id: 'account-1' }),
        { status: 'identity-conflict', identity: identity() }
    );

    const response = await fixture.app.request(
        `${PUBLIC_OAUTH_URL}/github/callback?state=state-1&code=provider-code`,
        { redirect: 'manual' }
    );

    assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.searchParams.get('oauth'), 'link-conflict');
    assert.equal(calls.createRefreshSession, 0);
});

test('a second subject for one provider is reported as already bound', async () => {
    const { fixture } = configureFixture(
        state({ intent: 'link', linking_account_id: 'account-1' }),
        { status: 'provider-conflict' }
    );

    const response = await fixture.app.request(
        `${PUBLIC_OAUTH_URL}/github/callback?state=state-1&code=provider-code`,
        { redirect: 'manual' }
    );

    assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.searchParams.get('oauth'), 'link-already-bound');
});

test('a login state never reaches the account-linking write', async () => {
    const { fixture, calls } = configureFixture(state({}));

    await fixture.app.request(
        `${PUBLIC_OAUTH_URL}/github/callback?state=state-1&code=provider-code`,
        { redirect: 'manual' }
    );

    assert.equal(calls.createOAuthIdentityForAccount.length, 0);
    assert.equal(calls.createRefreshSession, 1);
});

test('a provider denial on an app state is handed back to the deep link', async () => {
    const { fixture, calls } = configureFixture(state({ client_target: 'app', app_code_challenge: 'c'.repeat(43) }));

    const response = await fixture.app.request(
        `${PUBLIC_OAUTH_URL}/github/callback?state=state-1&error=access_denied`,
        { redirect: 'manual' }
    );

    assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.protocol, 'imsweb:');
    assert.equal(location.searchParams.get('error'), 'denied');
    assert.deepEqual([...location.searchParams.keys()], ['error']);
    assert.equal(location.searchParams.has('code'), false);
    assert.equal(calls.findOAuthStateReturnChannel, 1);
    assert.equal(calls.exchangeAuthorizationCode, 0);
});

test('a provider denial on a web state keeps the login redirect', async () => {
    const { fixture } = configureFixture(state({}));

    const response = await fixture.app.request(
        `${PUBLIC_OAUTH_URL}/github/callback?state=state-1&error=access_denied`,
        { redirect: 'manual' }
    );

    assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.pathname, '/account/login');
    assert.equal(location.searchParams.get('oauth'), 'denied');
});
