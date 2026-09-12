import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePlatformOAuthConfig, validatePlatformOAuthEndpoint } from '@/config/platform-oauth';
import { ConfiguredPlatformOAuthClient } from '@/infra/oauth/platform-oauth-client';
import { SqlPlatformAccountRepository } from '@/infra/db/repositories/platform-account-repository';
import type { SqlSchemaStrategy } from '@/infra/db/sql/database';
import {
    createPostgresTestHarness,
    postgresIntegrationEnabled,
} from '../integration/postgres-harness';
import type { PlatformOAuthProviderConfigRecord, PlatformOAuthProviderStore } from '@/ports/oauth';

const initializedPostgresSchema: SqlSchemaStrategy = {
    initializeCore: async () => undefined,
    initializePlatform: async () => undefined,
    initializeFudaba: async () => undefined,
    initializeStory: async () => undefined,
};

function provider(
    code: string,
    overrides: Partial<PlatformOAuthProviderConfigRecord> = {},
): PlatformOAuthProviderConfigRecord {
    return {
        code,
        displayName: code,
        icon: 'globe-2',
        buttonColor: '#111827',
        enabled: false,
        clientIdCiphertext: null,
        clientSecretCiphertext: null,
        redirectUri: null,
        authorizationEndpoint: 'https://example.com/oauth/authorize',
        tokenEndpoint: 'https://example.com/oauth/token',
        userInfoEndpoint: 'https://example.com/oauth/userinfo',
        scopes: ['openid', 'profile'],
        tokenAuthMethod: 'client_secret_post',
        pkceEnabled: true,
        profileSubjectPath: 'sub',
        profileDisplayNamePath: 'name',
        profileDisplayNameFallbackPath: 'email',
        profileAvatarUrlPath: 'picture',
        updatedAt: 0,
        ...overrides,
    };
}

function store(rows: PlatformOAuthProviderConfigRecord[]): PlatformOAuthProviderStore {
    return {
        async listOAuthProviderConfigs() {
            return rows;
        },
        async createOAuthProviderConfig(input) {
            const created = { ...input };
            rows.push(created);
            return { status: 'created', provider: created };
        },
        async updateOAuthProviderConfig(input) {
            const index = rows.findIndex(({ code }) => code === input.code);
            if (index < 0) return { status: 'not-found' };
            rows[index] = input;
            return { status: 'saved', provider: input };
        },
        async deleteOAuthProviderConfig(code) {
            const index = rows.findIndex((row) => row.code === code);
            if (index < 0) return 'not-found';
            rows.splice(index, 1);
            return 'deleted';
        },
    };
}

function client(
    rows: PlatformOAuthProviderConfigRecord[],
    fetchImpl: typeof fetch = globalThis.fetch,
) {
    return new ConfiguredPlatformOAuthClient(
        {
            requestTimeoutMs: 10_000,
            allowInsecureLoopbackEndpoints: false,
        },
        store(rows),
        {
            encrypt(value) {
                return value;
            },
            decrypt(value) {
                return value;
            },
        },
        fetchImpl,
        'test',
    );
}

test('loopback HTTP OAuth endpoints require the explicit development exception', () => {
    assert.equal(
        parsePlatformOAuthConfig({
            NODE_ENV: 'development',
            IMS_ALLOW_INSECURE_LOCAL_OAUTH_ENDPOINTS: '1',
        }).allowInsecureLoopbackEndpoints,
        true,
    );
    assert.equal(
        parsePlatformOAuthConfig({
            NODE_ENV: 'production',
            IMS_ALLOW_INSECURE_LOCAL_OAUTH_ENDPOINTS: '1',
        }).allowInsecureLoopbackEndpoints,
        false,
    );
    assert.throws(
        () =>
            validatePlatformOAuthEndpoint(
                'http://127.0.0.1:8000/oauth/token',
                'development',
                'tokenEndpoint',
            ),
        /public HTTPS/,
    );
    assert.equal(
        validatePlatformOAuthEndpoint(
            'http://127.0.0.1:8000/oauth/token',
            'development',
            'tokenEndpoint',
            true,
        ),
        'http://127.0.0.1:8000/oauth/token',
    );
    assert.equal(
        validatePlatformOAuthEndpoint(
            'https://example.com/oauth/token?tenant=imsweb',
            'production',
            'tokenEndpoint',
        ),
        'https://example.com/oauth/token?tenant=imsweb',
    );
});

test('OAuth settings expose every persisted provider in repository order', async () => {
    const settings = await client([
        provider('github', { icon: 'github' }),
        provider('custom-oidc', { icon: 'landmark' }),
        provider('google', { icon: 'google' }),
    ]).listProviderSettings();

    assert.deepEqual(
        settings.map(({ code, icon }) => ({ code, icon })),
        [
            { code: 'github', icon: 'github' },
            { code: 'custom-oidc', icon: 'landmark' },
            { code: 'google', icon: 'google' },
        ],
    );
});

test('public OAuth settings include only complete enabled providers', async () => {
    const configured = provider('custom-oidc', {
        enabled: true,
        clientIdCiphertext: 'client-id',
        clientSecretCiphertext: 'client-secret',
        redirectUri: 'https://app.example.com/api/platform/auth/oauth/custom-oidc/callback',
    });
    const providers = await client([
        configured,
        provider('disabled', { ...configured, code: 'disabled', enabled: false }),
        provider('incomplete', { ...configured, code: 'incomplete', clientSecretCiphertext: null }),
    ]).listProviders();

    assert.deepEqual(providers, [
        {
            code: 'custom-oidc',
            displayName: 'custom-oidc',
            icon: 'globe-2',
            buttonColor: '#111827',
        },
    ]);
});

test('OAuth provider writes reject private endpoint addresses', async () => {
    await assert.rejects(
        client([]).createProvider({
            code: 'private-idp',
            displayName: 'Private IDP',
            icon: 'landmark',
            buttonColor: '#445566',
            enabled: false,
            authorizationEndpoint: 'https://127.0.0.1/oauth/authorize',
            tokenEndpoint: 'https://example.com/oauth/token',
            userInfoEndpoint: 'https://example.com/oauth/userinfo',
            scopes: ['openid'],
            tokenAuthMethod: 'client_secret_post',
            pkceEnabled: true,
            profileSubjectPath: 'sub',
            profileDisplayNamePath: 'name',
            profileDisplayNameFallbackPath: null,
            profileAvatarUrlPath: null,
        }),
        /private/,
    );
});

test(
    'real PostgreSQL protects providers referenced by an OAuth state',
    {
        skip:
            !postgresIntegrationEnabled() &&
            'set IMS_TEST_POSTGRES_ADMIN_URL to a local PostgreSQL admin database',
    },
    async (t) => {
        const harness = await createPostgresTestHarness();
        t.after(() => harness.close());
        const repository = new SqlPlatformAccountRepository(
            harness.connection,
            initializedPostgresSchema,
        );
        await repository.initialize();
        const now = Date.now();
        const created = await repository.createOAuthProviderConfig({
            ...provider('referenced-provider'),
            updatedAt: now,
        });
        assert.equal(created.status, 'created');
        await repository.createOAuthState({
            stateHash: 'a'.repeat(64),
            providerCode: 'referenced-provider',
            intent: 'login',
            codeVerifier: 'v'.repeat(64),
            returnPath: '/account/me',
            expiresAt: now + 60_000,
            createdAt: now,
        });

        assert.equal(
            await repository.deleteOAuthProviderConfig(
                'referenced-provider',
                created.provider.updatedAt,
            ),
            'in-use',
        );
        assert.ok(await repository.consumeOAuthState('a'.repeat(64), 'referenced-provider', now));
        assert.equal(
            await repository.deleteOAuthProviderConfig(
                'referenced-provider',
                created.provider.updatedAt,
            ),
            'deleted',
        );
    },
);

test('generic OAuth exchange uses persisted protocol and nested profile paths', async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.endsWith('/oauth/token')) {
            return new Response(JSON.stringify({ access_token: 'access-token' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }
        return new Response(
            JSON.stringify({
                data: {
                    user: {
                        id: 765,
                        display: 'Haruka',
                        avatar: 'https://images.example.com/haruka.png',
                    },
                },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        );
    };
    const oauth = client(
        [
            provider('custom-oidc', {
                enabled: true,
                clientIdCiphertext: 'client-id',
                clientSecretCiphertext: 'client-secret',
                redirectUri: 'https://app.example.com/oauth/callback',
                tokenAuthMethod: 'client_secret_basic',
                pkceEnabled: false,
                profileSubjectPath: 'data.user.id',
                profileDisplayNamePath: 'data.user.display',
                profileDisplayNameFallbackPath: null,
                profileAvatarUrlPath: 'data.user.avatar',
            }),
        ],
        fetchImpl,
    );

    const profile = await oauth.exchangeAuthorizationCode('custom-oidc', {
        code: 'authorization-code',
        codeVerifier: 'unused-verifier',
    });

    assert.deepEqual(profile, {
        providerCode: 'custom-oidc',
        subject: '765',
        displayName: 'Haruka',
        avatarUrl: 'https://images.example.com/haruka.png',
    });
    assert.equal(requests.length, 2);
    const tokenHeaders = new Headers(requests[0]?.init?.headers);
    assert.equal(
        tokenHeaders.get('authorization'),
        `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
    );
    const tokenBody = new URLSearchParams(String(requests[0]?.init?.body));
    assert.equal(tokenBody.get('client_id'), null);
    assert.equal(tokenBody.get('client_secret'), null);
    assert.equal(tokenBody.get('code_verifier'), null);
    assert.equal(
        new Headers(requests[1]?.init?.headers).get('authorization'),
        'Bearer access-token',
    );
});
