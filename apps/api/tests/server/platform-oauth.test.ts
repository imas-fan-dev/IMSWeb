// Merged from 5 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import { readContractJson as assertRawJsonConforms } from '../contracts/contract-json';
import { createPostgresTestHarness, postgresIntegrationEnabled } from '../integration/postgres-harness';
import { postgresTest } from '../postgres-test-database';
import { closeSharedPostgresTestAllocator } from '../postgres-test-lifecycle.js';
import { createWikiFixture } from '../wiki/fixture';
import { parsePlatformOAuthConfig, validatePlatformOAuthEndpoint } from '@/config/platform-oauth';
import { BACKOFFICE_ACCESS_TOKEN_COOKIE, BACKOFFICE_CSRF_TOKEN_COOKIE } from '@/domains/admin/backoffice-auth/backoffice-auth-session';
import { SqlPlatformAccountRepository } from '@/infra/db/repositories/platform-account-repository';
import type { SqlSchemaStrategy } from '@/infra/db/sql/database';
import { ConfiguredPlatformOAuthClient } from '@/infra/oauth/platform-oauth-client';
import type { PlatformOAuthProviderCode, PlatformOAuthProviderConfigRecord, PlatformOAuthProviderStore } from '@/ports/oauth';
import type { CreatePlatformOAuthExchangeCodeInput, NewPlatformEmailAccountInput, NewPlatformOAuthAccountInput, PlatformAccountWithProfile, PlatformOAuthExchangeCodeRecord, PlatformOAuthIdentity, PlatformOAuthStateRecord, PlatformSecurityEventInput } from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';
import { // pi-lens-ignore: ts:2305
    platformOAuthCallbackQuerySchema, // pi-lens-ignore: ts:2305
    platformOAuthStartQuerySchema, platformOAuthProvidersResponseSchema } from '@imsweb/contracts/platform';
import { // pi-lens-ignore: ts:2305
    platformOAuthProviderCreateRequestSchema, // pi-lens-ignore: ts:2724
    platformOAuthAdminConflictErrorSchema, // pi-lens-ignore: ts:2724
    platformOAuthAdminHttpErrorSchema, platformOAuthAdminProviderDeleteSchema, platformOAuthAdminProviderListSchema, platformOAuthAdminProviderMutationSchema } from '@imsweb/contracts/platform/admin';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterAll, describe, onTestFinished, test } from 'vitest';

// platform-oauth-callback-branches.test.ts
{
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

    test.describe('platform oauth callback branches', () => {
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

        test.describe('a provider denial', () => {
            test('on an app state is handed back to the deep link', async () => {
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

            test('on a web state keeps the login redirect', async () => {
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
        });
    });
}

// platform-oauth-exchange.test.ts
{
    /**
 * The OAuth app exchange endpoint redeems the one-time deep-link code for a
 * bearer session. These cases pin every rejection the design promised:
 * missing bearer mode, a consumed or expired code, a verifier that does not
 * match the stored challenge, and an unavailable account. The code is consumed
 * before the challenge is compared, so a wrong verifier also burns the row.
 */

    const EXCHANGE_URL = '/api/platform/auth/oauth/exchange';
    const AT = 1_775_100_000_000;

    const CODE = 'c'.repeat(43);
    const VERIFIER = 'v'.repeat(43);
    const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

    function accountWithProfile(overrides: {
        status?: 'active' | 'restricted' | 'suspended' | 'deleted';
    } = {}): PlatformAccountWithProfile {
        return {
            account: {
                id: 'account-1',
                status: overrides.status ?? 'active',
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
            }
        };
    }

    function configureFixture(options: {
        consume?: PlatformOAuthExchangeCodeRecord | null;
        account?: PlatformAccountWithProfile | null;
        rateLimited?: boolean;
    }) {
        const fixture = createWikiFixture();
        const calls = {
            consumeOAuthExchangeCode: [] as Array<{ hash: string; at: number }>,
            createRefreshSession: 0,
            findAccountWithProfileById: 0
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
            async consumeOAuthExchangeCode(hash: string, at: number) {
                calls.consumeOAuthExchangeCode.push({ hash, at });
                return options.consume === undefined
                    ? { account_id: 'account-1', code_challenge: CHALLENGE }
                    : options.consume;
            },
            async findAccountWithProfileById() {
                calls.findAccountWithProfileById += 1;
                return options.account === undefined
                    ? accountWithProfile()
                    : options.account;
            },
            async createRefreshSession() {
                calls.createRefreshSession += 1;
                return true;
            }
        } as unknown as RuntimeServices['platformAccounts'];
        if (options.rateLimited) {
            fixture.services.rateLimiter = {
                async consume() {
                    return { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 };
                }
            };
        }
        return { fixture, calls };
    }

    async function postExchange(
        fixture: ReturnType<typeof createWikiFixture>,
        body: unknown,
        headers: Record<string, string> = {}
    ): Promise<Response> {
        return await fixture.app.request(EXCHANGE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-IMS-Auth-Mode': 'bearer',
                ...headers
            },
            body: JSON.stringify(body)
        });
    }

    test.describe('platform oauth exchange', () => {
        test('a valid code and verifier return a bearer session', async () => {
            const { fixture, calls } = configureFixture({});
            const response = await postExchange(fixture, {
                code: CODE,
                codeVerifier: VERIFIER
            });

            assert.equal(response.status, 200);
            const payload = await response.json();
            assert.equal(payload.success, true);
            assert.equal(payload.accessToken, 'signed-access-token');
            assert.match(payload.refreshToken, /^v1\.0\.[0-9a-f]{64}$/);
            assert.equal(calls.createRefreshSession, 1);
            // The code is looked up by SHA-256 hex, never by its raw value.
            assert.equal(
                calls.consumeOAuthExchangeCode[0]?.hash,
                createHash('sha256').update(CODE).digest('hex')
            );
        });

        test('a replayed code is rejected after the first redemption', async () => {
            let consumed = false;
            const fixture = createWikiFixture();
            fixture.services.platformTokens = {
                async sign() {
                    return 'signed-access-token';
                },
                async verify() {
                    throw new Error('not used');
                }
            };
            fixture.services.platformAccounts = {
                async consumeOAuthExchangeCode() {
                    if (consumed) return null;
                    consumed = true;
                    return { account_id: 'account-1', code_challenge: CHALLENGE };
                },
                async findAccountWithProfileById() {
                    return accountWithProfile();
                },
                async createRefreshSession() {
                    return true;
                }
            } as unknown as RuntimeServices['platformAccounts'];

            const first = await postExchange(fixture, {
                code: CODE,
                codeVerifier: VERIFIER
            });
            assert.equal(first.status, 200);
            const replay = await postExchange(fixture, {
                code: CODE,
                codeVerifier: VERIFIER
            });
            assert.equal(replay.status, 401);
            assert.equal((await replay.json()).code, 'PLATFORM_OAUTH_EXCHANGE_EXPIRED');
        });

        test('an expired or unknown code is rejected', async () => {
            const { fixture } = configureFixture({ consume: null });
            const response = await postExchange(fixture, {
                code: CODE,
                codeVerifier: VERIFIER
            });

            assert.equal(response.status, 401);
            assert.equal((await response.json()).code, 'PLATFORM_OAUTH_EXCHANGE_EXPIRED');
        });

        test('a verifier that does not match the challenge is rejected', async () => {
            const { fixture, calls } = configureFixture({});
            const response = await postExchange(fixture, {
                code: CODE,
                codeVerifier: 'x'.repeat(43)
            });

            assert.equal(response.status, 401);
            assert.equal((await response.json()).code, 'PLATFORM_OAUTH_EXCHANGE_INVALID');
            // The code was consumed before the comparison, so the row cannot be retried.
            assert.equal(calls.consumeOAuthExchangeCode.length, 1);
            assert.equal(calls.createRefreshSession, 0);
        });

        test('exchanging without the bearer auth mode is refused', async () => {
            const { fixture, calls } = configureFixture({});
            const response = await postExchange(
                fixture,
                { code: CODE, codeVerifier: VERIFIER },
                { 'X-IMS-Auth-Mode': 'cookie' }
            );

            assert.equal(response.status, 400);
            assert.equal(
                (await response.json()).code,
                'PLATFORM_OAUTH_EXCHANGE_BEARER_REQUIRED'
            );
            assert.equal(calls.consumeOAuthExchangeCode.length, 0);
        });

        test('an invalid exchange body is refused without leaking validation detail', async () => {
            const { fixture } = configureFixture({});
            const response = await fixture.app.request(EXCHANGE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-IMS-Auth-Mode': 'bearer'
                },
                body: JSON.stringify({ code: 'short', codeVerifier: VERIFIER, extra: true })
            });

            assert.equal(response.status, 400);
            assert.deepEqual(await response.json(), {
                success: false,
                code: 'PLATFORM_OAUTH_EXCHANGE_INVALID'
            });
        });

        test('an account that cannot hold a session is refused', async () => {
            const { fixture } = configureFixture({
                account: accountWithProfile({ status: 'suspended' })
            });
            const response = await postExchange(fixture, {
                code: CODE,
                codeVerifier: VERIFIER
            });

            assert.equal(response.status, 403);
            assert.equal((await response.json()).code, 'PLATFORM_ACCOUNT_UNAVAILABLE');
        });

        test('the exchange endpoint is rate limited', async () => {
            const { fixture } = configureFixture({ rateLimited: true });
            const response = await postExchange(fixture, {
                code: CODE,
                codeVerifier: VERIFIER
            });

            assert.equal(response.status, 429);
            assert.equal(response.headers.get('retry-after'), '60');
        });
    });
}

// platform-oauth-provider-settings.test.ts
{
    // This file drives the explicit-close harness adapter instead of `postgresTest`,
    // so it owns the end-of-process allocator cleanup that the Vitest adapter
    // registers for the other PostgreSQL suites.
    afterAll(closeSharedPostgresTestAllocator);

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

    test.describe('platform oauth provider settings', () => {
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
            { skip: !postgresIntegrationEnabled() },
            async () => {
                const harness = await createPostgresTestHarness();
                onTestFinished(() => harness.close());
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
                    linkingAccountId: null,
                    clientTarget: 'web',
                    appCodeChallenge: null,
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
    });
}

// platform-oauth-unlink-repository.test.ts
{
    /**
 * `deleteOAuthIdentity` decides whether an account still has a way back in, and
 * it decides it inside the DELETE's own WHERE clause. The contract suite drives
 * that capability through an in-memory stub, so the SQL predicate itself has no
 * coverage there: deleting `AND provider.enabled=TRUE` from the repository
 * leaves the whole contract suite green.
 *
 * These cases run the real statement against a real PostgreSQL so the rule is
 * pinned where it actually lives. The disabled-provider case is the one that
 * matters: a disabled provider cannot be used to sign in, so counting it as a
 * surviving login method would let the owner unlink the only usable one and
 * lock themselves out for good.
 */

    const AT = 1_775_100_000_000;

    const initializedPostgresSchema: SqlSchemaStrategy = {
        initializeCore: async () => undefined,
        initializePlatform: async () => undefined,
        initializeFudaba: async () => undefined,
        initializeStory: async () => undefined
    };

    async function createFixture(): Promise<{
        platform: SqlPlatformAccountRepository;
        setProviderEnabled: (code: string, enabled: boolean) => Promise<void>;
        linkedProviders: (accountId: string) => Promise<string[]>;
        /**
     * Adds a second identity row to an existing account. There is no repository
     * method for this yet: binding a further provider is a separate capability
     * that has not been built, so the row goes in directly.
     */
        linkIdentity: (
            accountId: string,
            providerCode: PlatformOAuthProviderCode
        ) => Promise<void>;
    }> {
        const harness = await createPostgresTestHarness();
        const platform = new SqlPlatformAccountRepository(
            harness.connection,
            initializedPostgresSchema
        );
        onTestFinished(() => harness.close());
        await platform.initialize();
        return {
            platform,
            setProviderEnabled: async (code, enabled) => {
                await harness.connection
                    .prepare('UPDATE platform_oauth_providers SET enabled=? WHERE code=?')
                    .bind(enabled, code)
                    .run();
            },
            linkIdentity: async (accountId, providerCode) => {
                await harness.connection
                    .prepare(
                        `INSERT INTO platform_oauth_identities
                        (provider_code, provider_subject, account_id,
                         provider_display_name, provider_avatar_url,
                         created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`
                    )
                    .bind(
                        providerCode,
                        `${providerCode}-subject-${accountId}`,
                        accountId,
                        'Linked Name',
                        '',
                        AT,
                        AT
                    )
                    .run();
            },
            linkedProviders: async (accountId) => {
                const rows = await harness.connection
                    .prepare(
                        `SELECT provider_code FROM platform_oauth_identities
                     WHERE account_id=? ORDER BY provider_code`
                    )
                    .bind(accountId)
                    .all<{ provider_code: string }>();
                return (rows.results ?? []).map((row) => row.provider_code);
            }
        };
    }

    function profile(id: string) {
        return {
            displayName: `Producer ${id}`,
            avatarObjectKey: null,
            avatarExternalUrl: null,
            homeCity: null,
            bio: '',
            updatedAt: AT
        };
    }

    function oauthAccount(
        id: string,
        providerCode: PlatformOAuthProviderCode
    ): NewPlatformOAuthAccountInput {
        return {
            id,
            status: 'active',
            tokenVersion: 0,
            createdAt: AT,
            updatedAt: AT,
            deletedAt: null,
            profile: profile(id),
            oauth: {
                providerCode,
                providerSubject: `${providerCode}-subject-${id}`,
                providerDisplayName: 'Linked Name',
                providerAvatarUrl: '',
                createdAt: AT,
                updatedAt: AT
            }
        };
    }

    function emailAccount(id: string): NewPlatformEmailAccountInput {
        return {
            id,
            status: 'active',
            tokenVersion: 0,
            createdAt: AT,
            updatedAt: AT,
            deletedAt: null,
            profile: profile(id),
            credential: {
                normalizedEmail: `${id}@ims.test`,
                algorithm: 'bcrypt',
                parametersJson: JSON.stringify({ cost: 12 }),
                passwordHash: `hash-${id}`,
                createdAt: AT,
                updatedAt: AT
            }
        };
    }

    function event(accountId: string): PlatformSecurityEventInput {
        return {
            id: `event-${accountId}-${Math.random().toString(36).slice(2)}`,
            accountId,
            eventType: 'auth.oauth.unlinked',
            requestId: null,
            ipAddress: null,
            userAgent: null,
            metadataJson: '{}',
            createdAt: AT
        };
    }

    describe('platform oauth unlink repository', () => {
        postgresTest('a disabled provider does not count as a surviving login method', async () => {
            const fixture = await createFixture();
            const accountId = 'account-disabled-survivor';

            // No password, two links, and the survivor's provider is switched off.
            assert.equal(
                (await fixture.platform.createOAuthAccount(
                    oauthAccount(accountId, 'google')
                )).status,
                'created'
            );
            await fixture.linkIdentity(accountId, 'github');
            await fixture.setProviderEnabled('github', false);

            const result = await fixture.platform.deleteOAuthIdentity({
                accountId,
                providerCode: 'google',
                event: event(accountId)
            });

            assert.equal(result.status, 'last-login-method');
            assert.deepEqual(await fixture.linkedProviders(accountId), ['github', 'google']);
        });

        postgresTest('an enabled sibling link lets the other one go', async () => {
            const fixture = await createFixture();
            const accountId = 'account-enabled-survivor';

            assert.equal(
                (await fixture.platform.createOAuthAccount(
                    oauthAccount(accountId, 'google')
                )).status,
                'created'
            );
            await fixture.linkIdentity(accountId, 'github');

            const result = await fixture.platform.deleteOAuthIdentity({
                accountId,
                providerCode: 'google',
                event: event(accountId)
            });

            assert.equal(result.status, 'deleted');
            assert.deepEqual(await fixture.linkedProviders(accountId), ['github']);
        });

        postgresTest('a password is a login method, so the only link can be unlinked', async () => {
            const fixture = await createFixture();
            const accountId = 'account-with-password';

            assert.equal(
                (await fixture.platform.createEmailAccount(emailAccount(accountId))).status,
                'created'
            );
            await fixture.linkIdentity(accountId, 'google');

            const result = await fixture.platform.deleteOAuthIdentity({
                accountId,
                providerCode: 'google',
                event: event(accountId)
            });

            assert.equal(result.status, 'deleted');
            assert.deepEqual(await fixture.linkedProviders(accountId), []);
        });

        postgresTest('the sole link of a password-less account survives its own removal', async () => {
            const fixture = await createFixture();
            const accountId = 'account-sole-link';

            assert.equal(
                (await fixture.platform.createOAuthAccount(
                    oauthAccount(accountId, 'google')
                )).status,
                'created'
            );

            const result = await fixture.platform.deleteOAuthIdentity({
                accountId,
                providerCode: 'google',
                event: event(accountId)
            });

            assert.equal(result.status, 'last-login-method');
            assert.deepEqual(await fixture.linkedProviders(accountId), ['google']);
        });

        postgresTest('another account link is never reachable', async () => {
            const fixture = await createFixture();
            const owner = 'account-link-owner';
            const stranger = 'account-link-stranger';

            assert.equal(
                (await fixture.platform.createOAuthAccount(
                    oauthAccount(owner, 'google')
                )).status,
                'created'
            );
            assert.equal(
                (await fixture.platform.createEmailAccount(emailAccount(stranger))).status,
                'created'
            );

            const result = await fixture.platform.deleteOAuthIdentity({
                accountId: stranger,
                providerCode: 'google',
                event: event(stranger)
            });

            assert.equal(result.status, 'not-found');
            assert.deepEqual(await fixture.linkedProviders(owner), ['google']);
        });
    });
}

// platform-oauth-wire-contract-conformance.test.ts
{
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

    test.describe('platform oauth wire contract conformance', () => {
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
    });
}
