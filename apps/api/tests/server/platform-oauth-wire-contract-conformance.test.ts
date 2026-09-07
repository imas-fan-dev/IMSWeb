import assert from 'node:assert/strict';
import test from 'node:test';
import {
    // pi-lens-ignore: ts:2305
    platformOAuthCallbackQuerySchema,
    platformOAuthProvidersResponseSchema,
    // pi-lens-ignore: ts:2305
    platformOAuthStartQuerySchema
} from '@imsweb/contracts/platform';
import {
    // pi-lens-ignore: ts:2724
    platformOAuthAdminConflictErrorSchema,
    // pi-lens-ignore: ts:2724
    platformOAuthAdminHttpErrorSchema,
    platformOAuthAdminProviderDeleteSchema,
    platformOAuthAdminProviderListSchema,
    platformOAuthAdminProviderMutationSchema,
    // pi-lens-ignore: ts:2305
    platformOAuthProviderCreateRequestSchema
} from '@imsweb/contracts/platform/admin';
import {
    BACKOFFICE_ACCESS_TOKEN_COOKIE,
    BACKOFFICE_CSRF_TOKEN_COOKIE
} from '@/domains/admin/backoffice-auth/backoffice-auth-session';
import type { RuntimeServices } from '@/ports/runtime-services';
import { createWikiFixture } from '../wiki/fixture';

const PUBLIC_OAUTH_URL = '/api/platform/auth/oauth';
const ADMIN_OAUTH_URL = '/api/admin/platform/auth/oauth';

const provider = {
    code: 'github',
    displayName: 'GitHub',
    icon: 'github',
    buttonColor: '#24292f',
    enabled: true,
    configured: true,
    clientIdMasked: 'github-client',
    redirectUri: 'https://ims.test/api/platform/auth/oauth/github/callback',
    authorizationEndpoint: 'https://github.example.test/authorize',
    tokenEndpoint: 'https://github.example.test/token',
    userInfoEndpoint: 'https://github.example.test/user',
    scopes: ['openid', 'profile'],
    tokenAuthMethod: 'client_secret_post' as const,
    pkceEnabled: true,
    profileSubjectPath: 'id',
    profileDisplayNamePath: 'name',
    profileDisplayNameFallbackPath: null,
    profileAvatarUrlPath: null,
    updatedAt: 1_000
};

const providerWrite = {
    code: provider.code,
    displayName: provider.displayName,
    icon: provider.icon,
    buttonColor: provider.buttonColor,
    enabled: provider.enabled,
    clientId: 'github-client',
    clientSecret: 'github-secret',
    redirectUri: provider.redirectUri,
    authorizationEndpoint: provider.authorizationEndpoint,
    tokenEndpoint: provider.tokenEndpoint,
    userInfoEndpoint: provider.userInfoEndpoint,
    scopes: provider.scopes,
    tokenAuthMethod: provider.tokenAuthMethod,
    pkceEnabled: provider.pkceEnabled,
    profileSubjectPath: provider.profileSubjectPath,
    profileDisplayNamePath: provider.profileDisplayNamePath,
    profileDisplayNameFallbackPath: provider.profileDisplayNameFallbackPath,
    profileAvatarUrlPath: provider.profileAvatarUrlPath
};

async function assertRawJsonConforms(
    response: Response,
    schema: { parse(input: unknown): unknown }
): Promise<unknown> {
    const raw: unknown = await response.json();
    const parsed = schema.parse(raw);
    assert.deepEqual(parsed, raw, 'contract schema stripped or changed raw JSON');
    return parsed;
}

async function superAdminHeaders(
    fixture: ReturnType<typeof createWikiFixture>
): Promise<Record<string, string>> {
    const csrf = 'oauth-wire-csrf';
    const token = await fixture.services.backofficeTokens!.sign({
        id: 1,
        username: 'oauth-wire-super-admin',
        dept: 'op',
        adminRole: 'super_admin',
        csrfSecret: csrf
    }, 7_200);
    return {
        Cookie: `${BACKOFFICE_ACCESS_TOKEN_COOKIE}=${token}; ${BACKOFFICE_CSRF_TOKEN_COOKIE}=${csrf}`,
        'X-CSRFToken': csrf
    };
}

function configureOAuthFixture() {
    const fixture = createWikiFixture();
    const createdStates: Array<Record<string, unknown>> = [];
    fixture.services.backofficeAuth = {
        async findUserById(id: number) {
            return id === 1
                ? {
                      id,
                      username: 'oauth-wire-super-admin',
                      password: 'unused-password-hash',
                      producername: 'OAuth Wire Super Admin',
                      dept: 'op',
                      admin_role: 'super_admin' as const,
                  }
                : null;
        },
    } as NonNullable<RuntimeServices['backofficeAuth']>;
    fixture.services.platformAccounts = {
        async createOAuthState(input: Record<string, unknown>) {
            createdStates.push(input);
        }
    } as unknown as RuntimeServices['platformAccounts'];
    fixture.services.platformOAuth = {
        async listProviders() {
            return [
                {
                    code: provider.code,
                    displayName: provider.displayName,
                    icon: provider.icon,
                    buttonColor: provider.buttonColor
                }
            ];
        },
        async createAuthorizationUrl() {
            return new URL('https://github.example.test/authorize?fixture=1');
        },
        async listProviderSettings() {
            return [provider];
        },
        async createProvider() {
            return { status: 'created', provider };
        },
        async updateProvider() {
            return { status: 'conflict', provider };
        },
        async deleteProvider() {
            return 'deleted';
        }
    } as unknown as RuntimeServices['platformOAuth'];
    return { fixture, createdStates };
}

test('mounted OAuth discovery, start, and callback preserve their wire contracts', async () => {
    const { fixture, createdStates } = configureOAuthFixture();

    const discovery = await fixture.app.request(`${PUBLIC_OAUTH_URL}/providers`);
    assert.equal(discovery.status, 200);
    await assertRawJsonConforms(discovery, platformOAuthProvidersResponseSchema);

    const start = await fixture.app.request(
        `${PUBLIC_OAUTH_URL}/github/start?returnPath=%2Faccount%2Fme&ignored=legacy`,
        { redirect: 'manual' }
    );
    assert.equal(start.status, 303);
    assert.equal(start.headers.get('location'), 'https://github.example.test/authorize?fixture=1');
    assert.equal(createdStates.length, 1);
    assert.equal(createdStates[0]?.returnPath, '/account/me');

    const strippedStartQuery = platformOAuthStartQuerySchema.parse({
        returnPath: '/account/me',
        ignored: 'legacy'
    });
    assert.deepEqual(strippedStartQuery, { returnPath: '/account/me' });

    const callbackQuery = {
        error: 'access_denied',
        vendor_trace: 'kept-for-provider-compatibility'
    };
    assert.deepEqual(platformOAuthCallbackQuerySchema.parse(callbackQuery), callbackQuery);
    const callback = await fixture.app.request(
        `${PUBLIC_OAUTH_URL}/github/callback?error=access_denied&vendor_trace=kept-for-provider-compatibility`,
        { redirect: 'manual' }
    );
    assert.equal(callback.status, 303);
    assert.match(callback.headers.get('location') ?? '', /oauth=denied/);
});

test('mounted OAuth provider administration emits exact success, conflict, and request-error DTOs', async () => {
    const { fixture } = configureOAuthFixture();
    const headers = await superAdminHeaders(fixture);

    const unauthorized = await fixture.app.request(`${ADMIN_OAUTH_URL}/providers`);
    assert.equal(unauthorized.status, 401);
    await assertRawJsonConforms(unauthorized, platformOAuthAdminHttpErrorSchema);

    const listed = await fixture.app.request(`${ADMIN_OAUTH_URL}/providers`, { headers });
    assert.equal(listed.status, 200, await listed.clone().text());
    await assertRawJsonConforms(listed, platformOAuthAdminProviderListSchema);

    const created = await fixture.app.request(`${ADMIN_OAUTH_URL}/providers`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(providerWrite)
    });
    assert.equal(created.status, 201, await created.clone().text());
    await assertRawJsonConforms(created, platformOAuthAdminProviderMutationSchema);

    const conflicting = await fixture.app.request(`${ADMIN_OAUTH_URL}/github`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ ...providerWrite, code: undefined, expectedUpdatedAt: 999 })
    });
    assert.equal(conflicting.status, 409, await conflicting.clone().text());
    await assertRawJsonConforms(conflicting, platformOAuthAdminConflictErrorSchema);

    const deleted = await fixture.app.request(`${ADMIN_OAUTH_URL}/github`, {
        method: 'DELETE',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ expectedUpdatedAt: provider.updatedAt })
    });
    assert.equal(deleted.status, 200);
    await assertRawJsonConforms(deleted, platformOAuthAdminProviderDeleteSchema);

    const strictUnknown = await fixture.app.request(`${ADMIN_OAUTH_URL}/providers`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ ...providerWrite, unexpected: true })
    });
    assert.equal(strictUnknown.status, 400);
    await assertRawJsonConforms(strictUnknown, platformOAuthAdminHttpErrorSchema);

    const noTrimmedPath = await fixture.app.request(`${ADMIN_OAUTH_URL}/github%20`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
            ...providerWrite,
            code: undefined,
            expectedUpdatedAt: provider.updatedAt
        })
    });
    assert.equal(noTrimmedPath.status, 400);
    await assertRawJsonConforms(noTrimmedPath, platformOAuthAdminHttpErrorSchema);

    assert.deepEqual(platformOAuthProviderCreateRequestSchema.parse(providerWrite), providerWrite);
});
