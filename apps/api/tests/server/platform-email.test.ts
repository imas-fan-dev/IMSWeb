// Merged from 9 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import { readContractJson as assertRawJsonConforms } from '../contracts/contract-json';
import { ACCOUNT_ID, AccountSecurityFixture, bearerHeaders, CURRENT_PASSWORD, GITHUB_PROVIDER, storedDigest } from '../fixtures/account-security-fixture';
import { bearerTokenHeaders, setCookieHeaders as setCookies } from '../fixtures/auth-request';
import { createPostgresTestHarness, postgresIntegrationEnabled } from '../integration/postgres-harness';
import { connectPostgresTestDatabase, createPostgresTestDatabase, postgresTest } from '../postgres-test-database';
import { closeSharedPostgresTestAllocator } from '../postgres-test-lifecycle.js';
import { createWikiFixture } from '../wiki/fixture';
import { createTestApp, testRequest } from './test-app';
import { BACKOFFICE_ACCESS_TOKEN_COOKIE, BACKOFFICE_CSRF_TOKEN_COOKIE } from '@/domains/admin/backoffice-auth/backoffice-auth-session';
import { hashPlatformEmailBindingCode } from '@/domains/identity/platform-account-security/email/email-binding-code';
import { isMigratedPbkdf2Parameters } from '@/domains/identity/platform-auth/contracts/credentials';
import { clearPlatformPasswordResetCooldown, markPlatformPasswordResetCooldown, platformPasswordResetCacheKey, platformPasswordResetRecipientKey, readPlatformPasswordResetCooldown } from '@/domains/identity/platform-auth/password-reset/password-reset-cache';
import { hashPlatformEmailVerificationCode } from '@/domains/identity/platform-auth/registration/email-verification';
import { clearPlatformEmailVerificationCooldown, markPlatformEmailVerificationCooldown, platformEmailVerificationCacheKey, readPlatformEmailVerificationCooldown } from '@/domains/identity/platform-auth/registration/email-verification-cache';
import { MemoryCache } from '@/infra/cache/memory/cache';
import { VALKEY_PLATFORM_EMAIL_RESEND_POLICY_WRITE_SCRIPT, ValkeyPlatformEmailResendPolicyCache } from '@/infra/cache/valkey/platform-email-resend-policy';
import { CachedPlatformEmailResendPolicyReader } from '@/infra/cache/valkey/platform-email-resend-policy-reader';
import { SqlPlatformAccountRepository } from '@/infra/db/repositories/platform-account-repository';
import { SqlPlatformEmailConfigurationRepository } from '@/infra/db/repositories/platform-email-configuration-repository';
import { SqlPlatformEmailDeliveryRepository } from '@/infra/db/repositories/platform-email-delivery-repository';
import type { ManagedSqlDatabase, SqlSchemaStrategy } from '@/infra/db/sql/database';
import { queryAll, queryOne } from '@/infra/db/sql/query';
import { PlatformEmailJobPayloadCipherAdapter } from '@/infra/email/smtp/platform-email-job-payload';
import { PlatformEmailSecretCipher } from '@/infra/email/smtp/platform-email-secrets';
import { ConfiguredPlatformEmailService } from '@/infra/email/smtp/platform-email-service';
import { BcryptPasswordVerifier } from '@/infra/security/bcrypt/password-verifier';
import { HmacPlatformTokenService } from '@/infra/security/hmac/platform-token-service';
import type { CacheOperationOptions, CacheStore } from '@/ports/cache';
import type { PlatformEmailConfigurationRecord, PlatformEmailConfigurationStore } from '@/ports/email';
import type { PlatformEmailDeliveryEnqueueInput, PlatformEmailDeliveryPurpose, PlatformEmailJobIdentity, PlatformEmailJobPayload, PlatformEmailJobPayloadCipher, PlatformEmailResendPolicyCache, PlatformEmailResendPolicyRecord, PlatformPasswordResetEmailDeliveryEnqueueInput, PlatformPasswordResetRecipientKey } from '@/ports/email-delivery';
import type { PlatformOAuthProviderSummary } from '@/ports/oauth';
import type { NewPlatformEmailAccountInput, PlatformAccountStatus } from '@/ports/repositories';
import type { NewVerifiedPlatformEmailAccountInput } from '@/ports/repositories/platform';
import type { RuntimeServices } from '@/ports/runtime-services';
import { NodeEmailDeliveryRunner } from '@/runtime/node-email-delivery-runner';
import { withBoundedCacheOperation } from '@/utils/cache/bounded-operation';
import { successFlagSchema } from '@imsweb/contracts/common';
import { adminApiPath } from '@imsweb/contracts/paths';
import { passwordResetIssueResponseSchema, platformHttpErrorSchema, platformRegistrationVerificationResponseSchema, platformSessionSchema } from '@imsweb/contracts/platform';
import { platformEmailBindingResponseSchema, platformEmailCredentialResponseSchema, platformEmailVerificationCodeResponseSchema, platformOAuthLinkAppStartResponseSchema } from '@imsweb/contracts/platform/account-security';
import { adminPlatformEmailConfigurationTestRequestSchema, adminPlatformEmailConfigurationWriteRequestSchema, adminPlatformEmailHttpErrorSchema, adminPlatformEmailMutationResponseSchema, adminPlatformEmailSettingsResponseSchema, adminPlatformEmailSettingsSchema, adminPlatformEmailTestResponseSchema } from '@imsweb/contracts/platform/admin-email';
import assert from 'node:assert/strict';
import { createHash, pbkdf2Sync, randomUUID } from 'node:crypto';
import { afterAll, describe, onTestFinished, test, test as nodeTest } from 'vitest';

// platform-email-auth.contract.test.ts
{
    const PLATFORM_SECRET =
        "platform-email-auth-test-secret-at-least-thirty-two-bytes";
    const PASSWORD = "correct horse battery staple";
    const LEGACY_PASSWORD = "old-pass";
    const ACCESS_COOKIE = "ims_platform_access";
    const REFRESH_COOKIE = "ims_platform_refresh";
    const CSRF_COOKIE = "ims_platform_csrf";
    const PLATFORM_COOKIE_NAMES = [ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE];

    const initializedPostgresSchema: SqlSchemaStrategy = {
        initializeCore: async () => undefined,
        initializePlatform: async () => undefined,
        initializeFudaba: async () => undefined,
        initializeStory: async () => undefined,
    };

    interface Fixture {
        app: ReturnType<typeof createTestApp>;
        database: ManagedSqlDatabase;
        databaseUrl?: string;
        repository: SqlPlatformAccountRepository;
        deliveryRepository: SqlPlatformEmailDeliveryRepository;
        payloadCipher: PlatformEmailJobPayloadCipher;
        connect(): ManagedSqlDatabase;
    }

    class HangingCache implements CacheStore {
        private pending<T>(): Promise<T> {
            return new Promise<T>(() => undefined);
        }

        get(): Promise<string | null> {
            return this.pending();
        }
        set(): Promise<void> {
            return this.pending();
        }
        delete(): Promise<void> {
            return this.pending();
        }
        ping(): Promise<void> {
            return this.pending();
        }
        async close(): Promise<void> {}
    }

    class FailingCache implements CacheStore {
        async get(): Promise<string | null> {
            throw new Error("cache unavailable");
        }
        async set(): Promise<void> {
            throw new Error("cache unavailable");
        }
        async delete(): Promise<void> {
            throw new Error("cache unavailable");
        }
        async ping(): Promise<void> {
            throw new Error("cache unavailable");
        }
        async close(): Promise<void> {}
    }

    function appWithPlatformEmail(
        repository: SqlPlatformAccountRepository,
        deliveryRepository: SqlPlatformEmailDeliveryRepository,
        payloadCipher: PlatformEmailJobPayloadCipher,
        cache?: CacheStore,
    ): ReturnType<typeof createTestApp> {
        const runtime = {
            platformAccounts: repository,
            passwords: new BcryptPasswordVerifier(),
            platformTokens: new HmacPlatformTokenService(PLATFORM_SECRET),
            platformEmailDeliveryQueue: deliveryRepository,
            platformEmailJobPayloadCipher: payloadCipher,
            platformEmailResendPolicy: {
                async getPolicy() {
                    return { resendCooldownSeconds: 60, updatedAt: 0 };
                },
            },
            ...(cache ? { cache } : {}),
            config: { cookieSecure: false, clientAddressSource: "direct" },
        } as unknown as RuntimeServices;
        return createTestApp(() => runtime);
    }

    function emailAccount(
        email: string,
        passwordHash: string,
        status: PlatformAccountStatus = "active",
    ): NewPlatformEmailAccountInput {
        const now = Date.now();
        return {
            id: randomUUID(),
            status,
            tokenVersion: 0,
            createdAt: now,
            updatedAt: now,
            deletedAt: status === "deleted" ? now : null,
            profile: {
                displayName: `Producer ${email}`,
                avatarObjectKey: null,
                avatarExternalUrl: null,
                homeCity: null,
                bio: "",
                updatedAt: now,
            },
            credential: {
                normalizedEmail: email,
                algorithm: "bcrypt",
                parametersJson: '{"cost":12}',
                passwordHash,
                createdAt: now,
                updatedAt: now,
            },
        };
    }

    async function createFixture(): Promise<Fixture> {
        const harness = await createPostgresTestHarness();
        onTestFinished(() => harness.close());
        const repository = new SqlPlatformAccountRepository(
            harness.connection,
            initializedPostgresSchema,
        );
        await repository.initialize();
        const deliveryRepository = new SqlPlatformEmailDeliveryRepository(
            harness.connection,
        );
        const payloadCipher = new PlatformEmailJobPayloadCipherAdapter(PLATFORM_SECRET);
        return {
            app: appWithPlatformEmail(
                repository,
                deliveryRepository,
                payloadCipher,
            ),
            database: harness.connection,
            databaseUrl: harness.databaseUrl,
            repository,
            deliveryRepository,
            payloadCipher,
            connect: () => harness.connect(),
        };
    }

    async function waitFor(
        predicate: () => boolean,
        message: string,
        timeoutMs = 2_000,
    ): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (!predicate()) {
            if (Date.now() >= deadline) assert.fail(message);
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
    }

    function jsonRequest(
        pathname: string,
        body: unknown,
        headers: HeadersInit = {},
    ): Request {
        return new Request(`http://ims.test${pathname}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify(body),
        });
    }

    function assertPlatformCookies(response: Response): void {
        const cookies = setCookies(response);
        assert.deepEqual(
            cookies.map((cookie) => cookie.split("=", 1)[0]).sort(),
            [...PLATFORM_COOKIE_NAMES].sort(),
        );
        for (const cookie of cookies) {
            assert.match(cookie, /SameSite=Lax/i);
            assert.doesNotMatch(
                cookie,
                /ims_admin_|refresh_token|csrf_token|^token=/i,
            );
        }
    }

    function assertPrivateAuthResponse(response: Response): void {
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        const vary = response.headers.get("vary") || "";
        assert.match(vary, /Authorization/i);
        assert.match(vary, /Cookie/i);
    }

    async function completeNextDelivery(
        fixture: Fixture,
        purpose: PlatformEmailDeliveryPurpose,
    ): Promise<string> {
        const now = Date.now();
        const claims = await fixture.deliveryRepository.claim({
            now,
            limit: 1,
            leaseDurationMs: 15_000,
        });
        assert.equal(claims.length, 1);
        const claim = claims[0];
        assert.equal(claim.purpose, purpose);
        const payload = fixture.payloadCipher.decrypt(claim, claim.payloadCiphertext);
        assert.equal(payload.purpose, purpose);
        assert.equal(
            await fixture.deliveryRepository.complete({
                jobId: claim.jobId,
                leaseToken: claim.leaseToken,
                normalizedEmail: payload.normalizedEmail,
                deliveryToken: claim.deliveryToken,
                acceptedAt: now,
            }),
            'completed',
        );
        return payload.code;
    }

    async function requestVerificationCode(
        fixture: Fixture,
        email: string,
    ): Promise<string> {
        const response = await fixture.app.request(
            jsonRequest("/api/platform/auth/register/verification-code", { email }),
        );
        assert.equal(response.status, 202, await response.clone().text());
        const body = await assertRawJsonConforms(
            response,
            platformRegistrationVerificationResponseSchema,
        );
        assert.deepEqual(body, {
            success: true,
            queued: true,
            retryAfterSeconds: 60,
        });
        assertPrivateAuthResponse(response);
        return completeNextDelivery(fixture, 'registration');
    }

    async function assertFailedResendPreservesOldCode(
        dialect: "postgresql",
    ): Promise<void> {
        const fixture = await createFixture();
        const email = `failed-resend-${dialect}@example.test`;
        const expiredAt = Date.now();
        await fixture.database
            .prepare(
                `INSERT INTO platform_email_verification_codes
            (normalized_email, code_hash, expires_at, resend_after,
             attempts_remaining, consumed_token, created_at, updated_at)
         VALUES (?, ?, ?, ?, 5, NULL, ?, ?)`,
            )
            .bind(
                `expired-${dialect}@example.test`,
                "e".repeat(64),
                expiredAt,
                expiredAt - 1,
                expiredAt - 2,
                expiredAt - 2,
            )
            .run();
        const oldCode = await requestVerificationCode(fixture, email);
        assert.equal(
            await fixture.database
                .prepare(
                    `SELECT COUNT(*) AS count FROM platform_email_verification_codes
         WHERE normalized_email=?`,
                )
                .bind(`expired-${dialect}@example.test`)
                .first<number>("count"),
            0,
        );
        const original = await fixture.database
            .prepare(
                `SELECT code_hash, attempts_remaining
         FROM platform_email_verification_codes WHERE normalized_email=?`,
            )
            .bind(email)
            .first<{ code_hash: string; attempts_remaining: number }>();
        assert.ok(original);
        await fixture.database
            .prepare(
                `UPDATE platform_email_verification_codes
         SET resend_after=created_at WHERE normalized_email=?`,
            )
            .bind(email)
            .run();

        const siblingConnection = fixture.connect();
        const siblingRepository = new SqlPlatformAccountRepository(
            siblingConnection,
            initializedPostgresSchema,
        );
        await siblingRepository.initialize();
        onTestFinished(() => siblingRepository.close().catch(() => undefined));
        const siblingDeliveryRepository = new SqlPlatformEmailDeliveryRepository(
            siblingConnection,
        );
        const registrationApp = appWithPlatformEmail(
            siblingRepository,
            siblingDeliveryRepository,
            fixture.payloadCipher,
        );

        const failedResend = await fixture.app.request(
            jsonRequest("/api/platform/auth/register/verification-code", { email }),
        );
        assert.equal(failedResend.status, 202);
        assert.deepEqual(await failedResend.json(), {
            success: true,
            queued: true,
            retryAfterSeconds: 60,
        });

        const staged = await fixture.database
            .prepare(
                `SELECT code_hash, attempts_remaining, pending_token, pending_code_hash
         FROM platform_email_verification_codes WHERE normalized_email=?`,
            )
            .bind(email)
            .first<{
                code_hash: string;
                attempts_remaining: number;
                pending_token: string | null;
                pending_code_hash: string | null;
            }>();
        assert.ok(staged);
        assert.equal(staged.code_hash, original.code_hash);
        assert.match(staged.pending_token || "", /^[a-f0-9]{64}$/);
        assert.match(staged.pending_code_hash || "", /^[a-f0-9]{64}$/);
        assert.notEqual(staged.pending_code_hash, staged.code_hash);

        const wrongCode = oldCode === "000000" ? "000001" : "000000";
        const wrongRegistration = await registrationApp.request(
            jsonRequest("/api/platform/auth/register", {
                email,
                displayName: "Concurrent Producer",
                password: PASSWORD,
                code: wrongCode,
            }),
        );
        assert.equal(wrongRegistration.status, 400);
        assert.deepEqual(await wrongRegistration.json(), {
            success: false,
            code: "PLATFORM_EMAIL_VERIFICATION_INVALID",
        });

        const resendClaims = await fixture.deliveryRepository.claim({
            now: Date.now(),
            limit: 1,
            leaseDurationMs: 15_000,
        });
        assert.equal(resendClaims.length, 1);
        assert.equal(
            await fixture.deliveryRepository.recordFailure({
                jobId: resendClaims[0].jobId,
                leaseToken: resendClaims[0].leaseToken,
                failedAt: Date.now(),
                category: 'authentication',
                transient: false,
                acceptanceAmbiguous: false,
            }),
            'failed',
        );
        const restored = await fixture.database
            .prepare(
                `SELECT code_hash, attempts_remaining, pending_token, pending_code_hash
         FROM platform_email_verification_codes WHERE normalized_email=?`,
            )
            .bind(email)
            .first<{
                code_hash: string;
                attempts_remaining: number;
                pending_token: string | null;
                pending_code_hash: string | null;
            }>();
        assert.deepEqual(restored, {
            code_hash: original.code_hash,
            attempts_remaining: original.attempts_remaining - 1,
            pending_token: null,
            pending_code_hash: null,
        });

        const registered = await registrationApp.request(
            jsonRequest("/api/platform/auth/register", {
                email,
                displayName: "Concurrent Producer",
                password: PASSWORD,
                code: oldCode,
            }),
        );
        assert.equal(registered.status, 201, await registered.clone().text());
        await siblingRepository.close();
    }

    async function assertRegistrationAndLogin(): Promise<void> {
        const fixture = await createFixture();
        const { app, database } = fixture;
        const registrationCode = await requestVerificationCode(
            fixture,
            " Producer@Example.Test ",
        );
        const register = await app.request(
            jsonRequest(
                "/api/platform/auth/register",
                {
                    email: " Producer@Example.Test ",
                    displayName: " Producer One ",
                    password: ` ${PASSWORD} `,
                    code: registrationCode,
                },
                {
                    Cookie: "ims_admin_access=backoffice-must-survive; ims_admin_csrf=unchanged",
                },
            ),
        );
        assert.equal(register.status, 201, await register.clone().text());
        assert.deepEqual(await register.clone().json(), {
            success: true,
            account: {
                id: ((await register.clone().json()) as { account: { id: string } })
                    .account.id,
                status: "active",
            },
            profile: {
                displayName: "Producer One",
                avatarUrl: null,
                homeCity: null,
                bio: "",
            },
        });
        assertPlatformCookies(register);
        assertPrivateAuthResponse(register);

        const stored = await database
            .prepare(
                `SELECT accounts.id, profiles.display_name, credentials.normalized_email,
                credentials.algorithm, credentials.parameters_json,
                credentials.salt, credentials.password_hash
         FROM platform_accounts accounts
         JOIN platform_profiles profiles ON profiles.account_id=accounts.id
         JOIN platform_email_credentials credentials
           ON credentials.account_id=accounts.id`,
            )
            .first<{
                id: string;
                display_name: string;
                normalized_email: string;
                algorithm: string;
                parameters_json: string;
                salt: string | null;
                password_hash: string;
            }>();
        assert.ok(stored);
        assert.equal(stored.display_name, "Producer One");
        assert.equal(stored.normalized_email, "producer@example.test");
        assert.equal(stored.algorithm, "bcrypt");
        assert.equal(stored.parameters_json, '{"cost":12,"normalization":"trim"}');
        assert.equal(stored.salt, null);
        assert.match(stored.password_hash, /^\$2[aby]\$12\$/);

        const login = await app.request(
            jsonRequest("/api/platform/auth/login", {
                email: " PRODUCER@example.test ",
                password: ` ${PASSWORD} `,
            }),
        );
        assert.equal(login.status, 200, await login.clone().text());
        assert.equal(
            ((await login.json()) as { account: { id: string } }).account.id,
            stored.id,
        );
        assertPlatformCookies(login);
        assertPrivateAuthResponse(login);

        const duplicateCode = await requestVerificationCode(
            fixture,
            "duplicate@example.test",
        );
        const [duplicateA, duplicateB] = await Promise.all([
            app.request(
                jsonRequest("/api/platform/auth/register", {
                    email: "duplicate@example.test",
                    displayName: "Duplicate A",
                    password: PASSWORD,
                    code: duplicateCode,
                }),
            ),
            app.request(
                jsonRequest("/api/platform/auth/register", {
                    email: "DUPLICATE@example.test",
                    displayName: "Duplicate B",
                    password: PASSWORD,
                    code: duplicateCode,
                }),
            ),
        ]);
        assert.deepEqual(
            [duplicateA.status, duplicateB.status].sort((a, b) => a - b),
            [201, 400],
        );
        assert.equal(
            await database
                .prepare(
                    "SELECT COUNT(*) AS count FROM platform_email_credentials WHERE normalized_email=?",
                )
                .bind("duplicate@example.test")
                .first<number>("count"),
            1,
        );
        assert.equal(
            await database
                .prepare("SELECT COUNT(*) AS count FROM platform_accounts")
                .first<number>("count"),
            2,
        );
        assert.equal(
            await database
                .prepare("SELECT COUNT(*) AS count FROM platform_profiles")
                .first<number>("count"),
            2,
        );
    }

    describe('platform email auth', () => {
        postgresTest("bearer callers get tokens from registration and login, cookie callers do not", async () => {
            const fixture = await createFixture();
            const bearerHeaders = { "X-IMS-Auth-Mode": "bearer" };
            const email = "bearer-producer@example.test";
            const code = await requestVerificationCode(fixture, email);

            const register = await fixture.app.request(
                jsonRequest(
                    "/api/platform/auth/register",
                    {
                        email,
                        displayName: "Bearer Producer",
                        password: PASSWORD,
                        code,
                    },
                    bearerHeaders,
                ),
            );
            assert.equal(register.status, 201, await register.clone().text());
            const registered = (await assertRawJsonConforms(
                register,
                platformSessionSchema,
            )) as {
                accessToken?: string;
                refreshToken?: string;
            };
            assert.equal(typeof registered.accessToken, "string");
            assert.equal(typeof registered.refreshToken, "string");
            // The session record also holds a CSRF secret and a session id; neither may
            // ride along in a response body.
            assert.deepEqual(Object.keys(registered).sort(), [
                "accessToken",
                "account",
                "profile",
                "refreshToken",
                "success",
            ]);

            const login = await fixture.app.request(
                jsonRequest(
                    "/api/platform/auth/login",
                    { email, password: PASSWORD },
                    bearerHeaders,
                ),
            );
            assert.equal(login.status, 200, await login.clone().text());
            const loggedIn = (await assertRawJsonConforms(
                login,
                platformSessionSchema,
            )) as {
                accessToken?: string;
                refreshToken?: string;
            };
            assert.ok(loggedIn.accessToken);
            assert.ok(loggedIn.refreshToken);
            assert.notEqual(loggedIn.accessToken, registered.accessToken);
            assert.deepEqual(Object.keys(loggedIn).sort(), [
                "accessToken",
                "account",
                "profile",
                "refreshToken",
                "success",
            ]);

            // The returned token is the whole session for a client without a cookie jar.
            const session = await testRequest(
                fixture.app,
                "/api/platform/auth/session",
                { headers: bearerTokenHeaders(loggedIn.accessToken!) },
            );
            assert.equal(session.status, 200, await session.clone().text());
            await assertRawJsonConforms(session, platformSessionSchema);

            const logout = await fixture.app.request("/api/platform/auth/logout", {
                method: "POST",
                headers: bearerTokenHeaders(loggedIn.accessToken!),
            });
            assert.equal(logout.status, 200, await logout.clone().text());
            await assertRawJsonConforms(logout, successFlagSchema);

            // The same credentials without the opt-in header keep tokens in cookies only.
            const cookieLogin = await fixture.app.request(
                jsonRequest("/api/platform/auth/login", { email, password: PASSWORD }),
            );
            assert.equal(cookieLogin.status, 200);
            const cookieBody = (await cookieLogin.clone().json()) as Record<
                string,
                unknown
            >;
            assert.equal("accessToken" in cookieBody, false);
            assert.equal("refreshToken" in cookieBody, false);
            assertPlatformCookies(cookieLogin);
        });

        postgresTest("password reset responses preserve exact JSON and reject invalid API email grammar", async () => {
            const fixture = await createFixture();
            const email = "reset-wire@example.test";
            const registrationCode = await requestVerificationCode(fixture, email);
            const registered = await fixture.app.request(
                jsonRequest("/api/platform/auth/register", {
                    email,
                    displayName: "制".repeat(80),
                    password: PASSWORD,
                    code: registrationCode,
                }),
            );
            assert.equal(registered.status, 201, await registered.clone().text());
            await assertRawJsonConforms(registered, platformSessionSchema);

            const issue = await fixture.app.request(
                jsonRequest("/api/platform/auth/password-reset/verification-code", { email }),
            );
            assert.equal(issue.status, 202, await issue.clone().text());
            assert.deepEqual(
                await assertRawJsonConforms(issue, passwordResetIssueResponseSchema),
                { success: true, queued: true, retryAfterSeconds: 60 },
            );
            const resetCode = await completeNextDelivery(fixture, 'password_reset');

            const completed = await fixture.app.request(
                jsonRequest("/api/platform/auth/password-reset", {
                    email,
                    code: resetCode,
                    password: "reset password 123",
                }),
            );
            assert.equal(completed.status, 200, await completed.clone().text());
            await assertRawJsonConforms(completed, successFlagSchema);

            const malformed = await fixture.app.request(
                jsonRequest("/api/platform/auth/password-reset/verification-code", {
                    email: "not-an-api-email",
                }),
            );
            assert.equal(malformed.status, 400);
            await assertRawJsonConforms(malformed, platformHttpErrorSchema);
        });

        postgresTest("registration verification is hashed, cached, atomically consumed, and single use", async () => {
            const fixture = await createFixture();
            const cache = new MemoryCache();
            fixture.app = appWithPlatformEmail(
                fixture.repository,
                fixture.deliveryRepository,
                fixture.payloadCipher,
                cache,
            );
            const email = "verified@example.test";
            const cacheKey = platformEmailVerificationCacheKey(email);
            const code = await requestVerificationCode(fixture, email);
            assert.notEqual(await cache.get(cacheKey), null);
            const stored = await fixture.database
                .prepare(
                    `SELECT code_hash, expires_at, resend_after, attempts_remaining, consumed_token
         FROM platform_email_verification_codes WHERE normalized_email=?`,
                )
                .bind(email)
                .first<{
                    code_hash: string;
                    expires_at: number;
                    resend_after: number;
                    attempts_remaining: number;
                    consumed_token: string | null;
                }>();
            assert.ok(stored);
            assert.match(stored.code_hash, /^[a-f0-9]{64}$/);
            assert.notEqual(stored.code_hash, code);
            assert.equal(stored.attempts_remaining, 5);
            assert.equal(stored.consumed_token, null);
            assert.ok(stored.expires_at > stored.resend_after);

            const cooldown = await fixture.app.request(
                jsonRequest("/api/platform/auth/register/verification-code", {
                    email: " VERIFIED@example.test ",
                }),
            );
            assert.equal(cooldown.status, 429);
            const cooldownBody = (await cooldown.json()) as {
                success: boolean;
                code: string;
                retryAfterSeconds: number;
            };
            assert.deepEqual(cooldownBody, {
                success: false,
                code: "PLATFORM_EMAIL_VERIFICATION_COOLDOWN",
                retryAfterSeconds: cooldownBody.retryAfterSeconds,
            });
            assert.ok(cooldownBody.retryAfterSeconds >= 59);
            assert.ok(cooldownBody.retryAfterSeconds <= 60);
            assert.equal(
                cooldown.headers.get("retry-after"),
                String(cooldownBody.retryAfterSeconds),
            );

            const wrongCode = code === "000000" ? "000001" : "000000";
            const wrong = await fixture.app.request(
                jsonRequest("/api/platform/auth/register", {
                    email,
                    displayName: "Verified Producer",
                    password: PASSWORD,
                    code: wrongCode,
                }),
            );
            assert.equal(wrong.status, 400);
            assert.deepEqual(await wrong.json(), {
                success: false,
                code: "PLATFORM_EMAIL_VERIFICATION_INVALID",
            });
            assert.equal(
                await fixture.database
                    .prepare(
                        `SELECT attempts_remaining FROM platform_email_verification_codes
         WHERE normalized_email=?`,
                    )
                    .bind(email)
                    .first<number>("attempts_remaining"),
                4,
            );

            const registered = await fixture.app.request(
                jsonRequest("/api/platform/auth/register", {
                    email,
                    displayName: "Verified Producer",
                    password: PASSWORD,
                    code,
                }),
            );
            assert.equal(registered.status, 201, await registered.clone().text());
            assert.equal(await cache.get(cacheKey), null);
            assert.equal(
                await fixture.database
                    .prepare(
                        `SELECT COUNT(*) AS count FROM platform_email_verification_codes
         WHERE normalized_email=?`,
                    )
                    .bind(email)
                    .first<number>("count"),
                0,
            );

            const replay = await fixture.app.request(
                jsonRequest("/api/platform/auth/register", {
                    email: "second@example.test",
                    displayName: "Replay Producer",
                    password: PASSWORD,
                    code,
                }),
            );
            assert.equal(replay.status, 400);
            assert.equal(
                await fixture.database
                    .prepare(
                        `SELECT COUNT(*) AS count FROM platform_email_credentials
         WHERE normalized_email='second@example.test'`,
                    )
                    .first<number>("count"),
                0,
            );
        });

        postgresTest("verification requests enqueue without SMTP and staged codes remain unusable", async () => {
            const fixture = await createFixture();
            const email = "queued@example.test";
            const response = await fixture.app.request(
                jsonRequest("/api/platform/auth/register/verification-code", { email }),
            );
            assert.equal(response.status, 202, await response.clone().text());
            assert.deepEqual(
                await assertRawJsonConforms(
                    response,
                    platformRegistrationVerificationResponseSchema,
                ),
                { success: true, queued: true, retryAfterSeconds: 60 },
            );
            assert.equal(
                await fixture.database
                    .prepare(
                        `SELECT COUNT(*) AS count FROM platform_email_delivery_jobs
                 WHERE purpose='registration' AND state='queued'`,
                    )
                    .first<number>("count"),
                1,
            );

            const claims = await fixture.deliveryRepository.claim({
                now: Date.now(),
                limit: 1,
                leaseDurationMs: 15_000,
            });
            assert.equal(claims.length, 1);
            const claim = claims[0];
            const payload = fixture.payloadCipher.decrypt(claim, claim.payloadCiphertext);
            const premature = await fixture.app.request(
                jsonRequest("/api/platform/auth/register", {
                    email,
                    displayName: "Queued Producer",
                    password: PASSWORD,
                    code: payload.code,
                }),
            );
            assert.equal(premature.status, 400);
            assert.deepEqual(await premature.json(), {
                success: false,
                code: "PLATFORM_EMAIL_VERIFICATION_INVALID",
            });

            assert.equal(
                await fixture.deliveryRepository.complete({
                    jobId: claim.jobId,
                    leaseToken: claim.leaseToken,
                    normalizedEmail: email,
                    deliveryToken: claim.deliveryToken,
                    acceptedAt: Date.now(),
                }),
                'completed',
            );
            const registered = await fixture.app.request(
                jsonRequest("/api/platform/auth/register", {
                    email,
                    displayName: "Queued Producer",
                    password: PASSWORD,
                    code: payload.code,
                }),
            );
            assert.equal(registered.status, 201, await registered.clone().text());
        });

        postgresTest('durable HTTP enqueue is completed by a fresh worker runner', async () => {
            const fixture = await createFixture();
            const email = 'worker-restart@example.test';
            const queued = await fixture.app.request(
                jsonRequest('/api/platform/auth/register/verification-code', { email }),
            );
            assert.equal(queued.status, 202, await queued.clone().text());

            const workerDatabase = fixture.connect();
            const workerRepository = new SqlPlatformEmailDeliveryRepository(workerDatabase);
            const workerCipher = new PlatformEmailJobPayloadCipherAdapter(PLATFORM_SECRET);
            const events: Record<string, unknown>[] = [];
            let deliveredCode: string | undefined;
            const runner = new NodeEmailDeliveryRunner(
                workerRepository,
                workerCipher,
                {
                    async deliverVerification(input) {
                        assert.equal(input.purpose, 'registration');
                        assert.equal(input.message.email, email);
                        assert.equal(input.signal.aborted, false);
                        deliveredCode = input.message.code;
                        return { status: 'accepted', acceptedAt: Date.now() };
                    },
                },
                {
                    pollIntervalMs: 5,
                    concurrency: 1,
                    leaseDurationMs: 1_000,
                    leaseRenewalMs: 250,
                    onEvent(event) {
                        events.push(event);
                    },
                    onError(error) {
                        assert.fail(`unexpected worker error: ${error.message}`);
                    },
                },
            );
            onTestFinished(async () => {
                await runner.close();
                await workerDatabase.close();
            });

            runner.start();
            await waitFor(
                () => events.some(
                    (event) => event.event === 'platform_email_delivery_completed',
                ),
                'fresh worker did not complete the durable HTTP job',
            );
            assert.match(deliveredCode ?? '', /^\d{6}$/);

            const registered = await fixture.app.request(
                jsonRequest('/api/platform/auth/register', {
                    email,
                    displayName: 'Restarted Worker Producer',
                    password: PASSWORD,
                    code: deliveredCode,
                }),
            );
            assert.equal(registered.status, 201, await registered.clone().text());
        });

        postgresTest("configured resend intervals and unknown password reset responses come from PostgreSQL", async () => {
            const fixture = await createFixture();
            const cache = new MemoryCache();
            fixture.app = appWithPlatformEmail(
                fixture.repository,
                fixture.deliveryRepository,
                fixture.payloadCipher,
                cache,
            );

            await fixture.database.prepare(
                `UPDATE platform_email_configuration
         SET resend_cooldown_seconds=30, updated_at=1 WHERE singleton_id=1`,
            ).run();
            const registrationEmail = "thirty-seconds@example.test";
            const registration = await fixture.app.request(
                jsonRequest("/api/platform/auth/register/verification-code", {
                    email: registrationEmail,
                }),
            );
            assert.equal(registration.status, 202);
            assert.deepEqual(await registration.json(), {
                success: true,
                queued: true,
                retryAfterSeconds: 30,
            });
            const registrationRow = await fixture.database.prepare(
                `SELECT created_at, resend_after
         FROM platform_email_verification_codes WHERE normalized_email=?`,
            ).bind(registrationEmail).first<{
                created_at: number;
                resend_after: number;
            }>();
            assert.ok(registrationRow);
            assert.deepEqual(
                JSON.parse(
                    (await cache.get(platformEmailVerificationCacheKey(registrationEmail)))
                        || "null",
                ),
                {
                    enqueuedAt: registrationRow.created_at,
                    resendCooldownSeconds: 30,
                    retryAfterAt: registrationRow.resend_after,
                },
            );

            await fixture.database.prepare(
                `UPDATE platform_email_configuration
         SET resend_cooldown_seconds=600, updated_at=2 WHERE singleton_id=1`,
            ).run();
            const knownEmail = "known-reset@example.test";
            const passwordHash = await new BcryptPasswordVerifier().hash(PASSWORD);
            assert.equal(
                (await fixture.repository.createEmailAccount(
                    emailAccount(knownEmail, passwordHash),
                )).status,
                "created",
            );
            const unknownEmail = "unknown-reset@example.test";
            const unknown = await fixture.app.request(
                jsonRequest("/api/platform/auth/password-reset/verification-code", {
                    email: unknownEmail,
                }),
            );
            const known = await fixture.app.request(
                jsonRequest("/api/platform/auth/password-reset/verification-code", {
                    email: knownEmail,
                }),
            );
            assert.equal(unknown.status, 202);
            assert.equal(known.status, 202);
            const expected = {
                success: true,
                queued: true,
                retryAfterSeconds: 600,
            };
            assert.deepEqual(await unknown.json(), expected);
            assert.deepEqual(await known.json(), expected);
            const passwordResetCandidate = await fixture.database.prepare(
                `SELECT normalized_email, created_at, resend_after
         FROM platform_password_reset_codes`,
            ).first<{
                normalized_email: string;
                created_at: number;
                resend_after: number;
            }>();
            assert.ok(passwordResetCandidate);
            assert.equal(passwordResetCandidate.normalized_email, knownEmail);
            assert.equal(
                await fixture.database.prepare(
                    `SELECT COUNT(*) AS count FROM platform_email_delivery_jobs
             WHERE purpose='password_reset'`,
                ).first<number>("count"),
                1,
            );
            assert.equal(
                await fixture.database.prepare(
                    `SELECT COUNT(*) AS count FROM platform_password_reset_codes`,
                ).first<number>("count"),
                1,
            );

            const unknownCacheKey = platformPasswordResetCacheKey(unknownEmail);
            const knownCacheKey = platformPasswordResetCacheKey(knownEmail);
            for (const [key, email] of [
                [unknownCacheKey, unknownEmail],
                [knownCacheKey, knownEmail],
            ]) {
                assert.match(key, /^platform-password-reset-cooldown:[a-f0-9]{64}$/);
                assert.equal(key.includes(email), false);
            }
            const unknownCacheValue = await cache.get(unknownCacheKey);
            const knownCacheValue = await cache.get(knownCacheKey);
            assert.ok(unknownCacheValue);
            assert.ok(knownCacheValue);
            assert.equal(unknownCacheValue.includes(unknownEmail), false);
            assert.equal(knownCacheValue.includes(knownEmail), false);
            const unknownCooldown = JSON.parse(unknownCacheValue) as {
                enqueuedAt: number;
                resendCooldownSeconds: number;
                retryAfterAt: number;
            };
            assert.deepEqual(Object.keys(unknownCooldown).sort(), [
                "enqueuedAt",
                "resendCooldownSeconds",
                "retryAfterAt",
            ]);
            assert.equal(unknownCooldown.resendCooldownSeconds, 600);
            assert.equal(unknownCooldown.retryAfterAt, unknownCooldown.enqueuedAt + 600_000);
            assert.deepEqual(JSON.parse(knownCacheValue), {
                enqueuedAt: passwordResetCandidate.created_at,
                resendCooldownSeconds: 600,
                retryAfterAt: passwordResetCandidate.resend_after,
            });

            for (const email of [knownEmail, unknownEmail]) {
                const repeated = await fixture.app.request(
                    jsonRequest("/api/platform/auth/password-reset/verification-code", {
                        email,
                    }),
                );
                assert.equal(repeated.status, 429);
                assert.deepEqual(
                    await assertRawJsonConforms(repeated, platformHttpErrorSchema),
                    {
                        success: false,
                        code: "PLATFORM_PASSWORD_RESET_COOLDOWN",
                        retryAfterSeconds: 600,
                    },
                );
                assert.equal(repeated.headers.get("retry-after"), "600");
            }
        });

        postgresTest("password reset cooldown is enumeration-safe with missing or failing cache", async () => {
            const fixture = await createFixture();
            await fixture.database.prepare(
                `UPDATE platform_email_configuration
         SET resend_cooldown_seconds=30, updated_at=1 WHERE singleton_id=1`,
            ).run();

            for (const [label, cache] of [
                ["missing", undefined],
                ["failing", new FailingCache()],
                ["hanging", new HangingCache()],
            ] as const) {
                const app = appWithPlatformEmail(
                    fixture.repository,
                    fixture.deliveryRepository,
                    fixture.payloadCipher,
                    cache,
                );
                const knownEmail = `${label}-known-reset@example.test`;
                const unknownEmail = `${label}-unknown-reset@example.test`;
                const passwordHash = await new BcryptPasswordVerifier().hash(PASSWORD);
                assert.equal(
                    (await fixture.repository.createEmailAccount(
                        emailAccount(knownEmail, passwordHash),
                    )).status,
                    "created",
                );
                const jobsBefore = await fixture.database.prepare(
                    `SELECT COUNT(*) AS count FROM platform_email_delivery_jobs
             WHERE purpose='password_reset'`,
                ).first<number>("count");
                assert.ok(jobsBefore !== null);

                const firstResponses = await Promise.all(
                    [knownEmail, unknownEmail].map((email) =>
                        app.request(
                            jsonRequest(
                                "/api/platform/auth/password-reset/verification-code",
                                { email },
                            ),
                        ),
                    ),
                );
                const firstBodies = [];
                for (const response of firstResponses) {
                    assert.equal(response.status, 202, await response.clone().text());
                    firstBodies.push(
                        await assertRawJsonConforms(
                            response,
                            passwordResetIssueResponseSchema,
                        ),
                    );
                }
                assert.deepEqual(firstBodies, [
                    { success: true, queued: true, retryAfterSeconds: 30 },
                    { success: true, queued: true, retryAfterSeconds: 30 },
                ]);

                const repeatResponses = await Promise.all(
                    [knownEmail, unknownEmail].map((email) =>
                        app.request(
                            jsonRequest(
                                "/api/platform/auth/password-reset/verification-code",
                                { email },
                            ),
                        ),
                    ),
                );
                const repeatBodies = [];
                for (const response of repeatResponses) {
                    assert.equal(response.status, 429, await response.clone().text());
                    repeatBodies.push(
                        await assertRawJsonConforms(response, platformHttpErrorSchema),
                    );
                    assert.equal(response.headers.get("retry-after"), "30");
                }
                assert.deepEqual(repeatBodies, [
                    {
                        success: false,
                        code: "PLATFORM_PASSWORD_RESET_COOLDOWN",
                        retryAfterSeconds: 30,
                    },
                    {
                        success: false,
                        code: "PLATFORM_PASSWORD_RESET_COOLDOWN",
                        retryAfterSeconds: 30,
                    },
                ]);

                assert.equal(
                    await fixture.database.prepare(
                        `SELECT COUNT(*) AS count FROM platform_password_reset_codes
                 WHERE normalized_email IN (?, ?)`,
                    ).bind(knownEmail, unknownEmail).first<number>("count"),
                    1,
                );
                assert.equal(
                    await fixture.database.prepare(
                        `SELECT COUNT(*) AS count FROM platform_password_reset_codes
                 WHERE normalized_email=?`,
                    ).bind(unknownEmail).first<number>("count"),
                    0,
                );
                assert.equal(
                    await fixture.database.prepare(
                        `SELECT COUNT(*) AS count FROM platform_email_delivery_jobs
                 WHERE purpose='password_reset'`,
                    ).first<number>("count"),
                    jobsBefore + 1,
                );

                const expectedKeys = [knownEmail, unknownEmail]
                    .map(platformPasswordResetRecipientKey)
                    .sort();
                const cooldownRows = await fixture.database.prepare(
                    `SELECT recipient_key, enqueued_at, resend_after, updated_at
             FROM platform_email_request_cooldowns
             WHERE purpose='password_reset' AND recipient_key IN (?, ?)
             ORDER BY recipient_key`,
                ).bind(...expectedKeys).all<{
                    recipient_key: string;
                    enqueued_at: number;
                    resend_after: number;
                    updated_at: number;
                }>();
                assert.equal(cooldownRows.results.length, 2);
                assert.deepEqual(
                    cooldownRows.results.map((row) => row.recipient_key),
                    expectedKeys,
                );
                for (const row of cooldownRows.results) {
                    assert.match(row.recipient_key, /^[a-f0-9]{64}$/);
                    assert.equal(row.resend_after, row.enqueued_at + 30_000);
                    assert.equal(row.updated_at, row.enqueued_at);
                }
                const serializedRows = JSON.stringify(cooldownRows.results);
                assert.equal(serializedRows.includes(knownEmail), false);
                assert.equal(serializedRows.includes(unknownEmail), false);
            }
        });

        postgresTest("cache failure falls through to SQL cooldown with exact Retry-After", async () => {
            const fixture = await createFixture();
            await fixture.database.prepare(
                `UPDATE platform_email_configuration
         SET resend_cooldown_seconds=30, updated_at=1 WHERE singleton_id=1`,
            ).run();
            fixture.app = appWithPlatformEmail(
                fixture.repository,
                fixture.deliveryRepository,
                fixture.payloadCipher,
                new FailingCache(),
            );
            const email = "sql-cooldown@example.test";
            const queued = await fixture.app.request(
                jsonRequest("/api/platform/auth/register/verification-code", { email }),
            );
            assert.equal(queued.status, 202);
            assert.deepEqual(await queued.json(), {
                success: true,
                queued: true,
                retryAfterSeconds: 30,
            });

            const cooldown = await fixture.app.request(
                jsonRequest("/api/platform/auth/register/verification-code", { email }),
            );
            assert.equal(cooldown.status, 429);
            const body = await assertRawJsonConforms(cooldown, platformHttpErrorSchema) as {
                success: false;
                code: string;
                retryAfterSeconds: number;
            };
            assert.deepEqual(body, {
                success: false,
                code: "PLATFORM_EMAIL_VERIFICATION_COOLDOWN",
                retryAfterSeconds: 30,
            });
            assert.equal(cooldown.headers.get("retry-after"), "30");
            assert.equal(
                await fixture.database.prepare(
                    `SELECT COUNT(*) AS count FROM platform_email_delivery_jobs
             WHERE purpose='registration'`,
                ).first<number>("count"),
                1,
            );
        });

        postgresTest("verification enqueue failure returns purpose-specific unavailable response", async () => {
            const fixture = await createFixture();
            fixture.deliveryRepository.enqueueRegistration = async () => {
                throw new Error("Injected enqueue failure");
            };
            const response = await fixture.app.request(
                jsonRequest("/api/platform/auth/register/verification-code", {
                    email: "failed@example.test",
                }),
            );
            assert.equal(response.status, 503);
            assert.deepEqual(await response.json(), {
                success: false,
                code: "PLATFORM_EMAIL_VERIFICATION_UNAVAILABLE",
            });
            assert.equal(
                await fixture.database
                    .prepare(
                        `SELECT COUNT(*) AS count FROM platform_email_verification_codes
                 WHERE normalized_email='failed@example.test'`,
                    )
                    .first<number>("count"),
                0,
            );
        });

        postgresTest("session fencing returns account unavailable without writing cookies", async () => {
            const fixture = await createFixture();
            const email = "session-fence@example.test";
            const code = await requestVerificationCode(fixture, email);
            fixture.repository.createRefreshSession = async () => false;

            const registration = await fixture.app.request(
                jsonRequest("/api/platform/auth/register", {
                    email,
                    displayName: "Session Fence Producer",
                    password: PASSWORD,
                    code,
                }),
            );
            assert.equal(registration.status, 403);
            assert.deepEqual(await registration.json(), {
                success: false,
                code: "PLATFORM_ACCOUNT_UNAVAILABLE",
            });
            assert.equal(setCookies(registration).length, 0);

            const login = await fixture.app.request(
                jsonRequest("/api/platform/auth/login", {
                    email,
                    password: PASSWORD,
                }),
            );
            assert.equal(login.status, 403);
            assert.deepEqual(await login.json(), {
                success: false,
                code: "PLATFORM_ACCOUNT_UNAVAILABLE",
            });
            assert.equal(setCookies(login).length, 0);
            assert.equal(
                await fixture.database
                    .prepare("SELECT COUNT(*) AS count FROM platform_refresh_sessions")
                    .first<number>("count"),
                0,
            );
        });

        postgresTest("login returns one generic credential error and rejects blocked account states", async () => {
            const { app, repository } = await createFixture();
            const passwordHash = await new BcryptPasswordVerifier().hash(PASSWORD);
            for (const status of ["active", "suspended", "deleted"] as const) {
                const result = await repository.createEmailAccount(
                    emailAccount(`${status}@example.test`, passwordHash, status),
                );
                assert.equal(result.status, "created");
            }

            const wrong = await app.request(
                jsonRequest("/api/platform/auth/login", {
                    email: "active@example.test",
                    password: "this password is wrong",
                }),
            );
            const missing = await app.request(
                jsonRequest("/api/platform/auth/login", {
                    email: "missing@example.test",
                    password: "this password is wrong",
                }),
            );
            assert.equal(wrong.status, 401);
            assert.equal(missing.status, 401);
            const wrongBody = await wrong.json();
            const missingBody = await missing.json();
            assert.deepEqual(wrongBody, missingBody);
            assert.deepEqual(missingBody, {
                success: false,
                code: "PLATFORM_CREDENTIALS_INVALID",
            });

            for (const [status, code] of [
                ["suspended", "PLATFORM_ACCOUNT_SUSPENDED"],
                ["deleted", "PLATFORM_ACCOUNT_UNAVAILABLE"],
            ] as const) {
                const response = await app.request(
                    jsonRequest("/api/platform/auth/login", {
                        email: `${status}@example.test`,
                        password: PASSWORD,
                    }),
                );
                assert.equal(response.status, 403);
                assert.deepEqual(await response.json(), { success: false, code });
                assert.equal(setCookies(response).length, 0);
            }
        });

        postgresTest("migrated PBKDF2 credential logs in once and upgrades with bcrypt CAS", async () => {
            const { app, database, repository } = await createFixture();
            const now = Date.now();
            const accountId = randomUUID();
            await repository.createAccountWithProfile({
                id: accountId,
                status: "active",
                tokenVersion: 0,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
                profile: {
                    displayName: "Migrated Producer",
                    avatarObjectKey: null,
                    avatarExternalUrl: null,
                    homeCity: null,
                    bio: "",
                    updatedAt: now,
                },
            });
            const salt = "legacy-fudaba-salt";
            const legacyHash = pbkdf2Sync(
                LEGACY_PASSWORD,
                salt,
                100_000,
                32,
                "sha256",
            ).toString("hex");
            await database
                .prepare(
                    `INSERT INTO platform_email_credentials
            (normalized_email, account_id, algorithm, parameters_json, salt,
             password_hash, created_at, updated_at)
         VALUES (?, ?, 'pbkdf2-sha256', ?, ?, ?, ?, ?)`,
                )
                .bind(
                    "legacy@domain..test",
                    accountId,
                    JSON.stringify({
                        iterations: 100_000,
                        hash: "sha256",
                        keyLength: 32,
                        encoding: "hex",
                        saltEncoding: "utf8",
                    }),
                    salt,
                    legacyHash,
                    now,
                    now,
                )
                .run();

            const response = await app.request(
                jsonRequest("/api/platform/auth/login", {
                    email: " LEGACY@DOMAIN..TEST ",
                    password: ` ${LEGACY_PASSWORD} `,
                }),
            );
            assert.equal(response.status, 200, await response.clone().text());
            const upgraded = await database
                .prepare(
                    `SELECT algorithm, parameters_json, salt, password_hash, updated_at
         FROM platform_email_credentials WHERE normalized_email=?`,
                )
                .bind("legacy@domain..test")
                .first<{
                    algorithm: string;
                    parameters_json: string;
                    salt: string | null;
                    password_hash: string;
                    updated_at: number;
                }>();
            assert.ok(upgraded);
            assert.equal(upgraded.algorithm, "bcrypt");
            assert.equal(
                upgraded.parameters_json,
                '{"cost":12,"normalization":"fudaba-trim"}',
            );
            assert.equal(upgraded.salt, null);
            assert.match(upgraded.password_hash, /^\$2[aby]\$12\$/);
            assert.ok(upgraded.updated_at >= now);
            assert.equal(
                await new BcryptPasswordVerifier().verify(
                    LEGACY_PASSWORD,
                    upgraded.password_hash,
                ),
                true,
            );
            assert.equal(
                await repository.upgradeEmailCredentialToBcrypt({
                    normalizedEmail: "legacy@domain..test",
                    expectedAlgorithm: "pbkdf2-sha256",
                    expectedPasswordHash: legacyHash,
                    expectedUpdatedAt: now,
                    passwordHash: "must-not-win",
                    parametersJson: '{"cost":12}',
                    updatedAt: Date.now(),
                }),
                false,
            );
        });

        postgresTest("long migrated PBKDF2 passwords authenticate without unsafe bcrypt upgrade", async () => {
            const { app, database, repository } = await createFixture();
            const now = Date.now();
            const accountId = randomUUID();
            const longPassword = "\u5236".repeat(25);
            assert.ok(Buffer.byteLength(longPassword, "utf8") > 72);
            await repository.createAccountWithProfile({
                id: accountId,
                status: "active",
                tokenVersion: 0,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
                profile: {
                    displayName: "Long Password Producer",
                    avatarObjectKey: null,
                    avatarExternalUrl: null,
                    homeCity: null,
                    bio: "",
                    updatedAt: now,
                },
            });
            const salt = "legacy-long-password-salt";
            const passwordHash = pbkdf2Sync(
                longPassword,
                salt,
                100_000,
                32,
                "sha256",
            ).toString("hex");
            await database
                .prepare(
                    `INSERT INTO platform_email_credentials
            (normalized_email, account_id, algorithm, parameters_json, salt,
             password_hash, created_at, updated_at)
         VALUES (?, ?, 'pbkdf2-sha256', ?, ?, ?, ?, ?)`,
                )
                .bind(
                    "long@example.test",
                    accountId,
                    JSON.stringify({
                        iterations: 100_000,
                        hash: "sha256",
                        keyLength: 32,
                        encoding: "hex",
                        saltEncoding: "utf8",
                    }),
                    salt,
                    passwordHash,
                    now,
                    now,
                )
                .run();

            const response = await app.request(
                jsonRequest("/api/platform/auth/login", {
                    email: " LONG@example.test ",
                    password: ` ${longPassword} `,
                }),
            );
            assert.equal(response.status, 200, await response.clone().text());
            const credential = await database
                .prepare(
                    `SELECT algorithm, salt, password_hash FROM platform_email_credentials
         WHERE normalized_email='long@example.test'`,
                )
                .first<{
                    algorithm: string;
                    salt: string | null;
                    password_hash: string;
                }>();
            assert.deepEqual(credential, {
                algorithm: "pbkdf2-sha256",
                salt,
                password_hash: passwordHash,
            });
        });

        postgresTest("bcrypt rejects passwords beyond 72 UTF-8 bytes instead of truncating", async () => {
            const fixture = await createFixture();
            const verifier = new BcryptPasswordVerifier();
            const exact = "a".repeat(72);
            const digest = await verifier.hash(exact);
            assert.equal(await verifier.verify(exact, digest), true);
            assert.equal(await verifier.verify(`${exact}b`, digest), false);
            await assert.rejects(verifier.hash("\u5236".repeat(25)), /72 UTF-8 bytes/);

            const rejected = await fixture.app.request(
                jsonRequest("/api/platform/auth/register", {
                    email: "oversized@example.test",
                    displayName: "Oversized Producer",
                    password: "\u5236".repeat(25),
                    code: "123456",
                }),
            );
            assert.equal(rejected.status, 400);
            assert.deepEqual(await rejected.json(), {
                success: false,
                code: "PLATFORM_AUTH_INPUT_INVALID",
            });
        });

        nodeTest("migrated PBKDF2 accepts only the declared Fudaba parameter contract", () => {
            const valid = {
                iterations: 100_000,
                hash: "sha256",
                keyLength: 32,
                encoding: "hex",
                saltEncoding: "utf8",
            };
            assert.equal(isMigratedPbkdf2Parameters(JSON.stringify(valid)), true);
            for (const parameters of [
                { ...valid, iterations: 99_999 },
                { ...valid, hash: "sha512" },
                { ...valid, keyLength: 64 },
                { ...valid, encoding: "base64" },
                { ...valid, saltEncoding: "hex" },
                { ...valid, extra: true },
                { iterations: 100_000, digest: "sha256", keyLength: 32 },
            ]) {
                assert.equal(
                    isMigratedPbkdf2Parameters(JSON.stringify(parameters)),
                    false,
                );
            }
            assert.equal(isMigratedPbkdf2Parameters("{"), false);
        });

        postgresTest("email auth strictly validates JSON shapes and credential fields", async () => {
            const { app } = await createFixture();
            const invalidRegistrations = [
                null,
                [],
                {
                    email: "invalid",
                    displayName: "Producer",
                    password: PASSWORD,
                    code: "123456",
                },
                {
                    email: "producer@example.test",
                    displayName: "   ",
                    password: PASSWORD,
                    code: "123456",
                },
                {
                    email: "producer@example.test",
                    displayName: "Producer",
                    password: "short",
                    code: "123456",
                },
                {
                    email: "producer@example.test",
                    displayName: "Producer",
                    password: PASSWORD,
                    code: "12345",
                },
                {
                    email: "producer@example.test",
                    displayName: "Producer",
                    password: PASSWORD,
                    code: "123456",
                    role: "admin",
                },
            ];
            for (const body of invalidRegistrations) {
                const response = await app.request(
                    jsonRequest("/api/platform/auth/register", body),
                );
                assert.equal(response.status, 400, JSON.stringify(body));
                assert.deepEqual(await response.json(), {
                    success: false,
                    code: "PLATFORM_AUTH_INPUT_INVALID",
                });
                assertPrivateAuthResponse(response);
            }
            const invalidJson = await testRequest(
                app,
                "/api/platform/auth/login",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: "{",
                },
            );
            assert.equal(invalidJson.status, 400);
            assert.deepEqual(await invalidJson.json(), {
                success: false,
                code: "PLATFORM_AUTH_INPUT_INVALID",
            });
            const missingJsonType = await testRequest(
                app,
                "/api/platform/auth/register",
                { method: "POST", body: JSON.stringify(invalidRegistrations[0]) },
            );
            assert.equal(missingJsonType.status, 415);
            assert.deepEqual(await missingJsonType.json(), {
                success: false,
                code: "PLATFORM_AUTH_JSON_REQUIRED",
            });
        });

        nodeTest("Platform email auth routes use independent IP rate-limit buckets", async () => {
            const calls: Array<{
                bucket: string;
                limit: number;
                windowSeconds: number;
            }> = [];
            const app = createTestApp(() => ({
                rateLimiter: {
                    async consume(bucket, _key, limit, windowSeconds) {
                        calls.push({ bucket, limit, windowSeconds });
                        return {
                            allowed: bucket !== "platform-auth-register",
                            remaining: limit - 1,
                            resetAt: Date.now() + 60_000,
                        };
                    },
                },
            }));
            const login = await app.request(
                jsonRequest("/api/platform/auth/login", null),
            );
            assert.equal(login.status, 400);
            const verification = await app.request(
                jsonRequest("/api/platform/auth/register/verification-code", null),
            );
            assert.equal(verification.status, 400);
            const passwordResetVerification = await app.request(
                jsonRequest("/api/platform/auth/password-reset/verification-code", null),
            );
            assert.equal(passwordResetVerification.status, 400);
            const register = await app.request(
                jsonRequest("/api/platform/auth/register", null),
            );
            assert.equal(register.status, 429);
            assertPrivateAuthResponse(register);
            assert.deepEqual(calls, [
                { bucket: "global", limit: 10_000, windowSeconds: 15 * 60 },
                { bucket: "platform-auth-login", limit: 20, windowSeconds: 15 * 60 },
                { bucket: "global", limit: 10_000, windowSeconds: 15 * 60 },
                {
                    bucket: "platform-auth-email-verification",
                    limit: 10,
                    windowSeconds: 60 * 60,
                },
                { bucket: "global", limit: 10_000, windowSeconds: 15 * 60 },
                {
                    bucket: "platform-auth-email-verification",
                    limit: 10,
                    windowSeconds: 60 * 60,
                },
                { bucket: "global", limit: 10_000, windowSeconds: 15 * 60 },
                { bucket: "platform-auth-register", limit: 10, windowSeconds: 60 * 60 },
            ]);
        });

        nodeTest("login account limiting shares a normalized digest across rotating IPs before lookup", async () => {
            const calls: Array<{
                bucket: string;
                key: string;
                limit: number;
                windowSeconds: number;
            }> = [];
            let repositoryLookups = 0;
            let passwordVerifications = 0;
            const resetAt = Date.now() + 61_000;
            const app = createTestApp(
                () =>
                    ({
                        platformAccounts: {
                            async findEmailIdentity() {
                                repositoryLookups += 1;
                                return null;
                            },
                        },
                        passwords: {
                            async hash() {
                                return "unused";
                            },
                            async verify() {
                                passwordVerifications += 1;
                                return false;
                            },
                        },
                        rateLimiter: {
                            async consume(
                                bucket: string,
                                key: string,
                                limit: number,
                                windowSeconds: number,
                            ) {
                                calls.push({ bucket, key, limit, windowSeconds });
                                return {
                                    allowed: bucket !== "platform-auth-login-account",
                                    remaining: limit - 1,
                                    resetAt,
                                };
                            },
                        },
                        config: { clientAddressSource: "nginx" },
                    }) as unknown as RuntimeServices,
            );
            const normalizedEmail = "targeted.producer@example.test";
            const responses = [];
            for (const [email, ip] of [
                [" Targeted.Producer@Example.Test ", "198.51.100.20"],
                [normalizedEmail, "203.0.113.40"],
            ]) {
                responses.push(
                    await app.request(
                        jsonRequest(
                            "/api/platform/auth/login",
                            {
                                email,
                                password: PASSWORD,
                            },
                            {
                                "X-Forwarded-For": ip,
                            },
                        ),
                    ),
                );
            }
            for (const response of responses) {
                assert.equal(response.status, 429);
                assert.deepEqual(await response.json(), { error: "Too many requests" });
                assert.match(response.headers.get("retry-after") || "", /^(60|61)$/);
                assertPrivateAuthResponse(response);
            }
            assert.equal(repositoryLookups, 0);
            assert.equal(passwordVerifications, 0);
            assert.deepEqual(
                calls.map(({ bucket, limit, windowSeconds }) => ({
                    bucket,
                    limit,
                    windowSeconds,
                })),
                [
                    { bucket: "global", limit: 10_000, windowSeconds: 15 * 60 },
                    {
                        bucket: "platform-auth-login",
                        limit: 20,
                        windowSeconds: 15 * 60,
                    },
                    {
                        bucket: "platform-auth-login-account",
                        limit: 50,
                        windowSeconds: 15 * 60,
                    },
                    { bucket: "global", limit: 10_000, windowSeconds: 15 * 60 },
                    {
                        bucket: "platform-auth-login",
                        limit: 20,
                        windowSeconds: 15 * 60,
                    },
                    {
                        bucket: "platform-auth-login-account",
                        limit: 50,
                        windowSeconds: 15 * 60,
                    },
                ],
            );
            assert.equal(calls[0]?.key, "198.51.100.20");
            assert.equal(calls[1]?.key, "198.51.100.20");
            assert.equal(calls[3]?.key, "203.0.113.40");
            assert.equal(calls[4]?.key, "203.0.113.40");
            const expectedAccountKey = createHash("sha256")
                .update("imsweb:platform-auth:login-account:v1\0")
                .update(normalizedEmail)
                .digest("hex");
            assert.equal(calls[2]?.key, expectedAccountKey);
            assert.equal(calls[5]?.key, expectedAccountKey);
            assert.match(expectedAccountKey, /^[a-f0-9]{64}$/);
            assert.notEqual(expectedAccountKey, normalizedEmail);
            assert.doesNotMatch(
                JSON.stringify(calls),
                /Targeted\.Producer@Example\.Test/i,
            );
        });

        postgresTest("real PostgreSQL keeps registration atomic under normalized email races", async () => {
            await assertRegistrationAndLogin();

            const fixture = await createFixture();
            const secondConnection = fixture.connect();
            const secondRepository = new SqlPlatformAccountRepository(
                secondConnection,
                initializedPostgresSchema,
            );
            await secondRepository.initialize();
            try {
                const [first, second] = await Promise.all([
                    fixture.repository.createEmailAccount(
                        emailAccount(
                            "cross-instance@example.test",
                            "$2b$12$bnPpILj3dtzbslu5F3vG4u7RzdkxYLF23bfHQBZv2bUfM4byX6NQ6",
                        ),
                    ),
                    secondRepository.createEmailAccount(
                        emailAccount(
                            "cross-instance@example.test",
                            "$2b$12$bnPpILj3dtzbslu5F3vG4u7RzdkxYLF23bfHQBZv2bUfM4byX6NQ6",
                        ),
                    ),
                ]);
                assert.deepEqual([first.status, second.status].sort(), [
                    "created",
                    "email-conflict",
                ]);
                assert.equal(
                    await fixture.database
                        .prepare(
                            `SELECT COUNT(*) AS count FROM platform_email_credentials
             WHERE normalized_email=?`,
                        )
                        .bind("cross-instance@example.test")
                        .first<number>("count"),
                    1,
                );
            } finally {
                await secondRepository.close();
            }
        });

        postgresTest("real PostgreSQL failed resend preserves old code across repository instances", async () => {
            await assertFailedResendPreservesOldCode("postgresql");
        });
    });
}

// platform-email-binding.contract.test.ts
{
    const EMAIL_URL = 'http://ims.test/api/platform/me/email';
    const CODE_URL = 'http://ims.test/api/platform/me/email/verification-code';
    const BIND_URL = 'http://ims.test/api/platform/me/email/bind';
    const CHANGE_URL = 'http://ims.test/api/platform/me/email/change';
    const LINK_START_URL = 'http://ims.test/api/platform/me/oauth-links/github/start';
    const LINK_START_UNAVAILABLE_URL =
        'http://ims.test/api/platform/me/oauth-links/legacy-sso/start';
    const LINK_CALLBACK_URL = 'http://ims.test/api/platform/auth/oauth/github/callback';
    const APP_CHALLENGE = 'c'.repeat(43);

    interface ErrorBody {
        code?: string;
        error?: string;
        success?: boolean;
    }

    async function sendJson(
        fixture: AccountSecurityFixture,
        url: string,
        body: unknown,
        headers: Record<string, string> = bearerHeaders()
    ): Promise<Response> {
        return await fixture.app.request(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify(body)
        });
    }

    test.describe('platform email binding', () => {
        test('raw JSON conforms across read, code, and bind', async () => {
            const fixture = new AccountSecurityFixture({ credential: null });

            const read = await fixture.app.request(EMAIL_URL, { headers: bearerHeaders() });
            assert.equal(read.status, 200);
            await assertRawJsonConforms(read, platformEmailCredentialResponseSchema);

            const code = await sendJson(fixture, CODE_URL, { email: 'bound@example.test' });
            assert.equal(code.status, 202);
            await assertRawJsonConforms(code, platformEmailVerificationCodeResponseSchema);

            const rawCode = fixture.emailedCodes.get('bound@example.test');
            assert.ok(rawCode);
            const bound = await sendJson(fixture, BIND_URL, {
                email: 'bound@example.test',
                code: rawCode,
                newPassword: 'bound-secret-123'
            });
            assert.equal(bound.status, 200);
            await assertRawJsonConforms(bound, platformEmailBindingResponseSchema);

            const anonymous = await fixture.app.request(EMAIL_URL);
            assert.equal(anonymous.status, 401);
            await assertRawJsonConforms(anonymous, platformHttpErrorSchema);
        });

        test('email binding rejects anonymous callers on every route', async () => {
            const fixture = new AccountSecurityFixture({ credential: null });
            const unauthenticated = [
                await fixture.app.request(CODE_URL, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ email: 'anon@example.test' })
                }),
                await fixture.app.request(BIND_URL, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        email: 'anon@example.test',
                        code: '012345',
                        newPassword: 'bound-secret-123'
                    })
                }),
                await fixture.app.request(CHANGE_URL, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        email: 'next@example.test',
                        code: '012345',
                        currentPassword: CURRENT_PASSWORD
                    })
                })
            ];
            for (const response of unauthenticated) {
                assert.equal(response.status, 401);
            }
            assert.equal(fixture.emailedCodes.size, 0);
        });

        test('the verification code is hashed with the binding domain, not the registration one', async () => {
            const fixture = new AccountSecurityFixture({ credential: null });
            const email = 'domain@example.test';

            const response = await sendJson(fixture, CODE_URL, { email });
            assert.equal(response.status, 202);

            const code = fixture.emailedCodes.get(email);
            assert.ok(code);
            const stored = fixture.verificationCodes.get(email);
            assert.ok(stored);
            assert.equal(stored.codeHash, hashPlatformEmailBindingCode(email, code));
            // The two code spaces must not collide on the shared table.
            assert.notEqual(
                hashPlatformEmailBindingCode(email, code),
                hashPlatformEmailVerificationCode(email, code)
            );
        });

        test('binding requires a valid code and leaves no credential on failure', async () => {
            const fixture = new AccountSecurityFixture({ credential: null });
            const email = 'invalid@example.test';
            fixture.issueEmailBindingCode(email, '123456');

            const failed = await sendJson(fixture, BIND_URL, {
                email,
                code: '000000',
                newPassword: 'bound-secret-123'
            });
            assert.equal(failed.status, 400);
            assert.equal(
                ((await failed.json()) as ErrorBody).code,
                'PLATFORM_EMAIL_VERIFICATION_INVALID'
            );
            assert.equal(
                await fixture.platformAccounts.findEmailCredentialByAccountId(ACCOUNT_ID),
                null
            );
            // A failed attempt must not spend the code.
            assert.equal(fixture.verificationCodes.get(email)?.consumedToken, null);

            const bound = await sendJson(fixture, BIND_URL, {
                email,
                code: '123456',
                newPassword: 'bound-secret-123'
            });
            assert.equal(bound.status, 200);
            const credential = await fixture.platformAccounts.findEmailCredentialByAccountId(
                ACCOUNT_ID
            );
            assert.ok(credential);
            assert.equal(credential.normalized_email, email);
            assert.equal(credential.password_hash, storedDigest('bound-secret-123'));
        });

        test('binding a second email for an account already bound is refused', async () => {
            const fixture = new AccountSecurityFixture();
            fixture.issueEmailBindingCode('second@example.test', '123456');

            const response = await sendJson(fixture, BIND_URL, {
                email: 'second@example.test',
                code: '123456',
                newPassword: 'bound-secret-123'
            });
            assert.equal(response.status, 409);
            assert.equal(
                ((await response.json()) as ErrorBody).code,
                'PLATFORM_EMAIL_ALREADY_BOUND'
            );
            assert.equal(fixture.credential?.normalized_email, 'owner@example.test');
        });

        test('sending a code for an address owned by another account is refused up front', async () => {
            const fixture = new AccountSecurityFixture({
                credential: null,
                foreignEmails: ['taken@example.test']
            });

            const response = await sendJson(fixture, CODE_URL, { email: 'taken@example.test' });
            assert.equal(response.status, 409);
            assert.equal(((await response.json()) as ErrorBody).code, 'PLATFORM_EMAIL_CONFLICT');
            // No mail is queued for an address the caller cannot claim.
            assert.equal(fixture.emailEnqueues.length, 0);
        });

        test.describe('changing an email', () => {
            test('needs the current password and keeps the credential on refusal', async () => {
                const fixture = new AccountSecurityFixture();
                const before = await fixture.platformAccounts.findEmailCredentialByAccountId(
                    ACCOUNT_ID
                );
                assert.ok(before);
                fixture.issueEmailBindingCode('next@example.test', '123456');

                const refused = await sendJson(fixture, CHANGE_URL, {
                    email: 'next@example.test',
                    code: '123456',
                    currentPassword: 'not-the-current-password'
                });
                assert.equal(refused.status, 403);
                assert.equal(
                    ((await refused.json()) as ErrorBody).code,
                    'PLATFORM_PASSWORD_CURRENT_INVALID'
                );
                assert.deepEqual(
                    await fixture.platformAccounts.findEmailCredentialByAccountId(ACCOUNT_ID),
                    before
                );
                // The code was not spent by a refusal that never reached the repository.
                assert.equal(fixture.verificationCodes.get('next@example.test')?.consumedToken, null);
            });

            test('preserves the password hash and every live session', async () => {
                const fixture = new AccountSecurityFixture();
                const before = await fixture.platformAccounts.findEmailCredentialByAccountId(
                    ACCOUNT_ID
                );
                assert.ok(before);
                const sessionsBefore = fixture.liveSessionIds();
                fixture.issueEmailBindingCode('moved@example.test', '123456');

                const response = await sendJson(fixture, CHANGE_URL, {
                    email: 'moved@example.test',
                    code: '123456',
                    currentPassword: CURRENT_PASSWORD
                });
                assert.equal(response.status, 200);
                assert.deepEqual(await response.json(), {
                    success: true,
                    email: 'moved@example.test'
                });

                const after = await fixture.platformAccounts.findEmailCredentialByAccountId(
                    ACCOUNT_ID
                );
                assert.ok(after);
                assert.equal(after.normalized_email, 'moved@example.test');
                // AC2a: the old password still signs in, with no reset step.
                assert.equal(after.password_hash, before.password_hash);
                assert.equal(after.algorithm, before.algorithm);
                assert.equal(after.salt, before.salt);
                assert.equal(after.created_at, before.created_at);
                assert.equal(
                    await fixture.passwords.verify(CURRENT_PASSWORD, after.password_hash),
                    true
                );
                // AC2a: sessions established before the migration are untouched.
                assert.deepEqual(fixture.liveSessionIds(), sessionsBefore);
            });
        });

        test('changing to an address owned by another account is refused without a partial write', async () => {
            const fixture = new AccountSecurityFixture({
                foreignEmails: ['taken@example.test']
            });
            const before = await fixture.platformAccounts.findEmailCredentialByAccountId(
                ACCOUNT_ID
            );

            const response = await sendJson(fixture, CHANGE_URL, {
                email: 'taken@example.test',
                code: '123456',
                currentPassword: CURRENT_PASSWORD
            });
            assert.equal(response.status, 409);
            assert.equal(((await response.json()) as ErrorBody).code, 'PLATFORM_EMAIL_CONFLICT');
            assert.deepEqual(
                await fixture.platformAccounts.findEmailCredentialByAccountId(ACCOUNT_ID),
                before
            );
        });

        test('changing an email on a provider-only account reports not-bound', async () => {
            const fixture = new AccountSecurityFixture({ credential: null });

            const response = await sendJson(fixture, CHANGE_URL, {
                email: 'next@example.test',
                code: '123456',
                currentPassword: CURRENT_PASSWORD
            });
            assert.equal(response.status, 409);
            assert.equal(((await response.json()) as ErrorBody).code, 'PLATFORM_EMAIL_NOT_BOUND');
        });

        test('email binding and OAuth link start use their own account-dimension buckets', async () => {
            const fixture = new AccountSecurityFixture();
            fixture.rateLimiter.deniedBuckets.add('platform-security-email-account');

            const limited = await sendJson(fixture, CODE_URL, { email: 'rate@example.test' });
            assert.equal(limited.status, 429);
            assert.equal(((await limited.json()) as ErrorBody).code, 'PLATFORM_RATE_LIMITED');
            assert.ok(
                fixture.rateLimiter.calls.some(
                    (call) => call.bucket === 'platform-security-email-account'
                )
            );
        });

        test('OAuth link start writes an intent=link state and redirects to the provider', async () => {
            const fixture = new AccountSecurityFixture({
                credential: null,
                oauthProviders: [
                    {
                        code: GITHUB_PROVIDER,
                        displayName: 'GitHub',
                        icon: 'github',
                        buttonColor: '#24292f'
                    } as PlatformOAuthProviderSummary
                ]
            });

            const response = await fixture.app.request(LINK_START_URL, {
                headers: bearerHeaders(),
                redirect: 'manual'
            });
            assert.equal(response.status, 303);
            assert.equal(
                response.headers.get('location'),
                'https://github.example.test/authorize'
            );
            assert.equal(fixture.oauthStateInputs.length, 1);
            const state = fixture.oauthStateInputs[0]!;
            assert.equal(state.intent, 'link');
            assert.equal(state.linkingAccountId, ACCOUNT_ID);
            assert.equal(state.returnPath, '/account/security');
            assert.equal(state.clientTarget, 'web');
            assert.equal(state.appCodeChallenge, null);
        });

        test('an unavailable provider returns to account security with a reason', async () => {
            const fixture = new AccountSecurityFixture({ credential: null });

            const response = await fixture.app.request(
                'http://ims.test/api/platform/me/oauth-links/legacy-sso/start',
                { headers: bearerHeaders(), redirect: 'manual' }
            );
            assert.equal(response.status, 303);
            const location = new URL(response.headers.get('location')!);
            assert.equal(location.pathname, '/account/security');
            assert.equal(location.searchParams.get('oauth'), 'link-unavailable');
            assert.equal(fixture.oauthStateInputs.length, 0);
        });

        test('a provider that cannot build an authorization URL writes no state', async () => {
            const fixture = new AccountSecurityFixture({
                credential: null,
                oauthProviders: [
                    {
                        code: GITHUB_PROVIDER,
                        displayName: 'GitHub',
                        icon: 'github',
                        buttonColor: '#24292f'
                    } as PlatformOAuthProviderSummary
                ]
            });
            fixture.oauthAuthorizationUrl = null;

            const response = await fixture.app.request(LINK_START_URL, {
                headers: bearerHeaders(),
                redirect: 'manual'
            });
            assert.equal(response.status, 303);
            const location = new URL(response.headers.get('location')!);
            assert.equal(location.searchParams.get('oauth'), 'link-unavailable');
            assert.equal(fixture.oauthStateInputs.length, 0);
        });

        test('OAuth link start demands a session', async () => {
            const fixture = new AccountSecurityFixture({ credential: null });

            const response = await fixture.app.request(LINK_START_URL, {
                redirect: 'manual'
            });
            assert.equal(response.status, 401);
        });

        test.describe('app OAuth link start', () => {
            test('returns the provider URL and records an app state', async () => {
                const fixture = new AccountSecurityFixture({ credential: null });

                const response = await sendJson(fixture, LINK_START_URL, {
                    codeChallenge: APP_CHALLENGE
                });
                assert.equal(response.status, 200);
                // The account-security `/me/*` family adds `private` on top of the
                // handler's `no-store`, so the effective header is the stricter pair.
                assert.equal(response.headers.get('cache-control'), 'private, no-store');
                const body = await assertRawJsonConforms(
                    response,
                    platformOAuthLinkAppStartResponseSchema
                );
                assert.deepEqual(body, {
                    success: true,
                    authorizationUrl: 'https://github.example.test/authorize'
                });

                assert.equal(fixture.oauthStateInputs.length, 1);
                const state = fixture.oauthStateInputs[0]!;
                assert.equal(state.intent, 'link');
                assert.equal(state.linkingAccountId, ACCOUNT_ID);
                assert.equal(state.returnPath, '/account/security');
                assert.equal(state.clientTarget, 'app');
                assert.equal(state.appCodeChallenge, APP_CHALLENGE);
            });

            test('demands a bearer session', async () => {
                const fixture = new AccountSecurityFixture({ credential: null });

                const response = await sendJson(
                    fixture,
                    LINK_START_URL,
                    { codeChallenge: APP_CHALLENGE },
                    {}
                );
                assert.equal(response.status, 401);
                assert.equal(fixture.oauthStateInputs.length, 0);
            });

            test('rejects an unusable challenge', async () => {
                const fixture = new AccountSecurityFixture({ credential: null });

                const response = await sendJson(fixture, LINK_START_URL, {
                    codeChallenge: 'too-short'
                });
                assert.equal(response.status, 400);
                assert.equal(
                    ((await response.json()) as ErrorBody).code,
                    'PLATFORM_OAUTH_LINK_INPUT_INVALID'
                );
                assert.equal(fixture.oauthStateInputs.length, 0);
            });

            test('rejects an unknown body key', async () => {
                const fixture = new AccountSecurityFixture({ credential: null });

                // `client` belongs to the login start query; sending it here must be a
                // rejection rather than a silently ignored field, so the strict policy is
                // observable at the HTTP boundary, not only in the schema definition.
                const response = await sendJson(fixture, LINK_START_URL, {
                    codeChallenge: APP_CHALLENGE,
                    client: 'app'
                });
                assert.equal(response.status, 400);
                assert.equal(
                    ((await response.json()) as ErrorBody).code,
                    'PLATFORM_OAUTH_LINK_INPUT_INVALID'
                );
                assert.equal(fixture.oauthStateInputs.length, 0);
            });

            test('reports an unavailable provider', async () => {
                const fixture = new AccountSecurityFixture({ credential: null });

                const response = await sendJson(fixture, LINK_START_UNAVAILABLE_URL, {
                    codeChallenge: APP_CHALLENGE
                });
                assert.equal(response.status, 404);
                assert.deepEqual(await response.json(), {
                    success: false,
                    code: 'PLATFORM_OAUTH_LINK_UNAVAILABLE'
                });
                assert.equal(fixture.oauthStateInputs.length, 0);
            });
        });

        test('an app link callback returns a one-time code with flow=link', async () => {
            const fixture = new AccountSecurityFixture({ credential: null });
            fixture.issueOAuthState('link-app-state', {
                client_target: 'app',
                app_code_challenge: APP_CHALLENGE
            });

            const response = await fixture.app.request(
                `${LINK_CALLBACK_URL}?state=link-app-state&code=provider-code`,
                { redirect: 'manual' }
            );
            assert.equal(response.status, 303);
            const location = response.headers.get('location')!;
            assert.match(
                location,
                /^imsweb:\/\/oauth\/callback\?code=[A-Za-z0-9_-]{43}&flow=link$/
            );
            assert.equal(fixture.oauthExchangeCodeInputs.length, 1);
            const exchange = fixture.oauthExchangeCodeInputs[0]!;
            assert.equal(exchange.accountId, ACCOUNT_ID);
            assert.equal(exchange.codeChallenge, APP_CHALLENGE);
            // 300s against the 600s state TTL is the deliberate one-time window.
            assert.equal(exchange.expiresAt - exchange.createdAt, 300_000);
        });

        test('a refused app link callback returns an error with flow=link', async () => {
            const fixture = new AccountSecurityFixture({ credential: null });
            fixture.issueOAuthState('link-app-conflict', {
                client_target: 'app',
                app_code_challenge: APP_CHALLENGE
            });
            fixture.oauthLinkResult = { status: 'provider-conflict' };

            const response = await fixture.app.request(
                `${LINK_CALLBACK_URL}?state=link-app-conflict&code=provider-code`,
                { redirect: 'manual' }
            );
            assert.equal(response.status, 303);
            assert.equal(
                response.headers.get('location'),
                'imsweb://oauth/callback?error=link-already-bound&flow=link'
            );
            assert.equal(fixture.oauthExchangeCodeInputs.length, 0);
        });

        test('a web link callback still returns to account security with a reason', async () => {
            const fixture = new AccountSecurityFixture({ credential: null });
            fixture.issueOAuthState('link-web-state', { client_target: 'web' });
            fixture.oauthLinkResult = { status: 'provider-conflict' };

            const response = await fixture.app.request(
                `${LINK_CALLBACK_URL}?state=link-web-state&code=provider-code`,
                { redirect: 'manual' }
            );
            assert.equal(response.status, 303);
            const location = new URL(response.headers.get('location')!);
            assert.equal(location.pathname, '/account/security');
            assert.equal(location.searchParams.get('oauth'), 'link-already-bound');
            assert.equal(fixture.oauthExchangeCodeInputs.length, 0);
        });

        test('a provider denial on a link+app state keeps flow=link', async () => {
            const fixture = new AccountSecurityFixture({ credential: null });
            fixture.issueOAuthState('link-app-denied', {
                client_target: 'app',
                app_code_challenge: APP_CHALLENGE
            });

            const response = await fixture.app.request(
                `${LINK_CALLBACK_URL}?state=link-app-denied&error=access_denied`,
                { redirect: 'manual' }
            );
            assert.equal(response.status, 303);
            assert.equal(
                response.headers.get('location'),
                'imsweb://oauth/callback?error=denied&flow=link'
            );
            // The denial early return is read-only; the callback can still consume it.
            assert.equal(fixture.oauthStateRows.size, 1);
        });
    });
}

// platform-email-cache.test.ts
{
    class HangingCache implements CacheStore {
        abortedOperations = 0;

        private pending<T>(options?: CacheOperationOptions): Promise<T> {
            return new Promise<T>((_resolve, reject) => {
                options?.signal?.addEventListener(
                    "abort",
                    () => {
                        this.abortedOperations += 1;
                        reject(new Error("cache operation aborted"));
                    },
                    { once: true },
                );
            });
        }

        get(_key: string, options?: CacheOperationOptions): Promise<string | null> {
            return this.pending(options);
        }
        set(
            _key: string,
            _value: string,
            _ttlSeconds: number,
            options?: CacheOperationOptions,
        ): Promise<void> {
            return this.pending(options);
        }
        delete(_key: string, options?: CacheOperationOptions): Promise<void> {
            return this.pending(options);
        }
        ping(): Promise<void> {
            return this.pending();
        }
        async close(): Promise<void> {}
    }

    class FailingCache implements CacheStore {
        async get(): Promise<string | null> {
            throw new Error("cache unavailable");
        }
        async set(): Promise<void> {
            throw new Error("cache unavailable");
        }
        async delete(): Promise<void> {
            throw new Error("cache unavailable");
        }
        async ping(): Promise<void> {
            throw new Error("cache unavailable");
        }
        async close(): Promise<void> {}
    }

    test.describe('platform email cooldown', () => {
        test("uses an anonymous key, strict snapshot, and deadline TTL", async () => {
            let now = 1_000_000;
            const cache = new MemoryCache(() => now);
            const email = "Producer@example.test";
            const key = platformEmailVerificationCacheKey(email);
            const cooldown = {
                enqueuedAt: now,
                resendCooldownSeconds: 60,
                retryAfterAt: now + 60_000,
            };

            assert.match(key, /^platform-email-verification-cooldown:[a-f0-9]{64}$/);
            assert.equal(key.includes(email), false);
            await markPlatformEmailVerificationCooldown(cache, email, cooldown, () => now);
            assert.deepEqual(JSON.parse((await cache.get(key)) || "null"), cooldown);
            assert.equal(
                await readPlatformEmailVerificationCooldown(cache, email, () => now),
                60_000,
            );

            now += 60_001;
            assert.equal(
                await readPlatformEmailVerificationCooldown(cache, email, () => now),
                null,
            );
        });

        test("can be cleared after delivery or registration", async () => {
            const cache = new MemoryCache(() => 1_000_000);
            const email = "clear@example.test";
            await markPlatformEmailVerificationCooldown(
                cache,
                email,
                {
                    enqueuedAt: 1_000_000,
                    resendCooldownSeconds: 60,
                    retryAfterAt: 1_060_000,
                },
                () => 1_000_000,
            );
            await clearPlatformEmailVerificationCooldown(cache, email);
            assert.equal(
                await readPlatformEmailVerificationCooldown(
                    cache,
                    email,
                    () => 1_000_000,
                ),
                null,
            );
        });

        test("rejects malformed records and fails open when unavailable", async () => {
            const now = 1_000_000;
            const malformedCache = new MemoryCache(() => now);
            const email = "fallback@example.test";
            const key = platformEmailVerificationCacheKey(email);
            for (const value of [
                { enqueuedAt: now, resendCooldownSeconds: 29, retryAfterAt: now + 29_000 },
                { enqueuedAt: now, resendCooldownSeconds: 601, retryAfterAt: now + 601_000 },
                { enqueuedAt: now, resendCooldownSeconds: 60, retryAfterAt: now + 59_000 },
                {
                    enqueuedAt: now,
                    resendCooldownSeconds: 60,
                    retryAfterAt: now + 60_000,
                    extra: true,
                },
            ]) {
                await malformedCache.set(key, JSON.stringify(value), 600);
                assert.equal(
                    await readPlatformEmailVerificationCooldown(
                        malformedCache,
                        email,
                        () => now,
                    ),
                    null,
                );
            }

            const cache = new FailingCache();
            await markPlatformEmailVerificationCooldown(cache, email, {
                enqueuedAt: now,
                resendCooldownSeconds: 60,
                retryAfterAt: now + 60_000,
            });
            await clearPlatformEmailVerificationCooldown(cache, email);
            assert.equal(await readPlatformEmailVerificationCooldown(cache, email), null);
        });

        test("email cooldown cache operations abort when the backend never settles", async () => {
            const now = 1_000_000;
            const cache = new HangingCache();
            const cooldown = {
                enqueuedAt: now,
                resendCooldownSeconds: 60,
                retryAfterAt: now + 60_000,
            };

            await assert.rejects(
                withBoundedCacheOperation(
                    (signal) => cache.get("direct", { signal }),
                    1,
                ),
                /exceeded its deadline/,
            );
            const [registration, passwordReset] = await withBoundedCacheOperation(
                () => Promise.all([
                    Promise.all([
                        readPlatformEmailVerificationCooldown(
                            cache,
                            "bounded-registration@example.test",
                            () => now,
                        ),
                        markPlatformEmailVerificationCooldown(
                            cache,
                            "bounded-registration@example.test",
                            cooldown,
                            () => now,
                        ),
                        clearPlatformEmailVerificationCooldown(
                            cache,
                            "bounded-registration@example.test",
                        ),
                    ]),
                    Promise.all([
                        readPlatformPasswordResetCooldown(
                            cache,
                            "bounded-reset@example.test",
                            () => now,
                        ),
                        markPlatformPasswordResetCooldown(
                            cache,
                            "bounded-reset@example.test",
                            cooldown,
                            () => now,
                        ),
                        clearPlatformPasswordResetCooldown(
                            cache,
                            "bounded-reset@example.test",
                        ),
                    ]),
                ]),
                1_000,
            );

            assert.equal(registration[0], null);
            assert.equal(passwordReset[0], null);
            assert.equal(cache.abortedOperations, 7);
        });

        test("password reset cooldown uses the same strict snapshot without exposing email", async () => {
            const now = 2_000_000;
            const cache = new MemoryCache(() => now);
            const email = "reset@example.test";
            const recipientKey = platformPasswordResetRecipientKey(email);
            const key = platformPasswordResetCacheKey(email);
            const cooldown = {
                enqueuedAt: now,
                resendCooldownSeconds: 600,
                retryAfterAt: now + 600_000,
            };

            assert.match(recipientKey, /^[a-f0-9]{64}$/);
            assert.equal(key, `platform-password-reset-cooldown:${recipientKey}`);
            assert.notEqual(
                recipientKey,
                platformEmailVerificationCacheKey(email).split(":")[1],
            );
            assert.equal(recipientKey.includes(email), false);
            assert.equal(key.includes(email), false);
            await markPlatformPasswordResetCooldown(cache, email, cooldown, () => now);
            assert.deepEqual(JSON.parse((await cache.get(key)) || "null"), cooldown);
            assert.equal(
                await readPlatformPasswordResetCooldown(cache, email, () => now),
                600_000,
            );

            await cache.set(
                key,
                JSON.stringify({ ...cooldown, resendCooldownSeconds: 60 }),
                600,
            );
            assert.equal(
                await readPlatformPasswordResetCooldown(cache, email, () => now),
                null,
            );
        });
    });
}

// platform-email-delivery-repository.test.ts
{
    const SECRET = 'platform-email-delivery-repository-test-secret-0123456789';
    const cipher = new PlatformEmailJobPayloadCipherAdapter(SECRET);
    const initializedSchema: SqlSchemaStrategy = {
        initializeCore: async () => undefined,
        initializePlatform: async () => undefined,
        initializeFudaba: async () => undefined,
        initializeStory: async () => undefined,
    };

    interface DeliveryFixture {
        input: PlatformEmailDeliveryEnqueueInput;
        code: string;
    }

    interface JobState {
        state: string;
        attempts: number;
        next_attempt_at: number;
        deadline_at: number;
        lease_token: string | null;
        lease_expires_at: number | null;
        failure_category: string | null;
        acceptance_ambiguous: boolean;
        updated_at: number;
    }

    interface RequestCooldownState {
        purpose: string;
        recipient_key: string;
        enqueued_at: number;
        resend_after: number;
        updated_at: number;
    }

    interface VerificationState {
        code_hash: string;
        expires_at: number;
        resend_after: number;
        attempts_remaining: number;
        delivery_token: string | null;
        pending_token: string | null;
        pending_code_hash: string | null;
        pending_resend_after: number | null;
    }

    function hash(value: string): string {
        return createHash('sha256').update(value).digest('hex');
    }

    function delivery(
        purpose: PlatformEmailDeliveryPurpose,
        email: string,
        marker: string,
        createdAt: number,
    ): DeliveryFixture {
        const code = String(100000 + Number.parseInt(hash(marker).slice(0, 5), 16) % 900000);
        const identity = {
            jobId: hash(`job:${marker}`),
            purpose,
            deliveryToken: hash(`delivery:${marker}`),
            payloadVersion: 1,
        } as const;
        const prepared = purpose === 'registration'
            ? cipher.encrypt(identity, {
                  purpose: 'registration',
                  normalizedEmail: email,
                  code,
                  expiresInMinutes: 10,
              })
            : cipher.encrypt(identity, {
                  purpose: 'password_reset',
                  normalizedEmail: email,
                  code,
                  expiresInMinutes: 15,
              });
        return {
            code,
            input: {
                ...prepared,
                codeHash: hash(code),
                createdAt,
            },
        };
    }

    function passwordResetDeliveryInput(
        fixture: DeliveryFixture,
    ): PlatformPasswordResetEmailDeliveryEnqueueInput {
        return {
            ...fixture.input,
            recipientKey: platformPasswordResetRecipientKey(
                fixture.input.normalizedEmail,
            ),
        } as PlatformPasswordResetEmailDeliveryEnqueueInput;
    }

    function emailAccount(email: string, now: number): NewPlatformEmailAccountInput {
        return {
            id: randomUUID(),
            status: 'active',
            tokenVersion: 0,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            profile: {
                displayName: 'Email delivery test',
                avatarObjectKey: null,
                avatarExternalUrl: null,
                homeCity: null,
                bio: '',
                updatedAt: now,
            },
            credential: {
                normalizedEmail: email,
                algorithm: 'bcrypt',
                parametersJson: '{"cost":12}',
                passwordHash: hash(`password:${email}`),
                createdAt: now,
                updatedAt: now,
            },
        };
    }

    function verifiedAccount(
        fixture: DeliveryFixture,
        verifiedAt: number,
    ): NewVerifiedPlatformEmailAccountInput {
        return {
            ...emailAccount(fixture.input.normalizedEmail, verifiedAt),
            verification: {
                codeHash: fixture.input.codeHash,
                consumedToken: hash(`consume:${fixture.input.jobId}`),
                verifiedAt,
            },
        };
    }

    function jobState(
        database: ManagedSqlDatabase,
        jobId: string,
    ): Promise<JobState | null> {
        return queryOne<JobState>(
            database,
            `SELECT state, attempts, next_attempt_at, deadline_at, lease_token,
                lease_expires_at, failure_category, acceptance_ambiguous, updated_at
         FROM platform_email_delivery_jobs WHERE id=?`,
            [jobId],
        );
    }

    function requestCooldownState(
        database: ManagedSqlDatabase,
        recipientKey: string,
    ): Promise<RequestCooldownState | null> {
        return queryOne<RequestCooldownState>(
            database,
            `SELECT purpose, recipient_key, enqueued_at, resend_after, updated_at
         FROM platform_email_request_cooldowns
         WHERE purpose='password_reset' AND recipient_key=?`,
            [recipientKey],
        );
    }

    function verificationState(
        database: ManagedSqlDatabase,
        purpose: PlatformEmailDeliveryPurpose,
        email: string,
    ): Promise<VerificationState | null> {
        const table = purpose === 'registration'
            ? 'platform_email_verification_codes'
            : 'platform_password_reset_codes';
        return queryOne<VerificationState>(
            database,
            `SELECT code_hash, expires_at, resend_after, attempts_remaining,
                delivery_token, pending_token, pending_code_hash,
                pending_resend_after
         FROM ${table} WHERE normalized_email=?`,
            [email],
        );
    }

    async function claimOne(
        repository: SqlPlatformEmailDeliveryRepository,
        now: number,
        leaseDurationMs = 15_000,
    ) {
        const claims = await repository.claim({ now, limit: 1, leaseDurationMs });
        assert.equal(claims.length, 1);
        return claims[0];
    }

    async function useDatabase(label: string) {
        const database = await createPostgresTestDatabase(label);
        return {
            database,
            repository: new SqlPlatformEmailDeliveryRepository(database),
            accountRepository: new SqlPlatformAccountRepository(database, initializedSchema),
        };
    }

    describe('platform email delivery repository', () => {
        postgresTest('registration enqueue is atomic, encrypted, and unusable until delivery completes', async () => {
            const { database, repository, accountRepository } = await useDatabase(
                'email-delivery-registration',
            );
            const initial = delivery(
                'registration',
                'registration@example.test',
                'registration-initial',
                10_000,
            );
            const queued = await repository.enqueueRegistration(initial.input);
            assert.deepEqual(queued, {
                status: 'queued',
                resendAfter: 70_000,
                retryAfterSeconds: 60,
                policyUpdatedAt: 0,
            });

            const storedJob = await queryOne<{
                payload_ciphertext: string;
                purpose: string;
                state: string;
            }>(
                database,
                `SELECT payload_ciphertext, purpose, state
         FROM platform_email_delivery_jobs WHERE id=?`,
                [initial.input.jobId],
            );
            assert.ok(storedJob);
            assert.equal(storedJob.purpose, 'registration');
            assert.equal(storedJob.state, 'queued');
            const serializedJob = JSON.stringify(storedJob);
            assert.equal(serializedJob.includes(initial.input.normalizedEmail), false);
            assert.equal(serializedJob.includes(initial.code), false);

            assert.equal(
                (await accountRepository.createVerifiedEmailAccount(
                    verifiedAccount(initial, 11_000),
                )).status,
                'verification-invalid',
            );

            const claim = await claimOne(repository, 12_000);
            assert.equal(
                await repository.complete({
                    jobId: claim.jobId,
                    leaseToken: claim.leaseToken,
                    normalizedEmail: initial.input.normalizedEmail,
                    deliveryToken: claim.deliveryToken,
                    acceptedAt: 13_000,
                }),
                'completed',
            );
            assert.deepEqual(
                await verificationState(
                    database,
                    'registration',
                    initial.input.normalizedEmail,
                ),
                {
                    code_hash: initial.input.codeHash,
                    expires_at: 613_000,
                    resend_after: 70_000,
                    attempts_remaining: 5,
                    delivery_token: null,
                    pending_token: null,
                    pending_code_hash: null,
                    pending_resend_after: null,
                },
            );
            assert.equal(
                (await accountRepository.createVerifiedEmailAccount(
                    verifiedAccount(initial, 14_000),
                )).status,
                'created',
            );
            assert.equal(
                await verificationState(
                    database,
                    'registration',
                    initial.input.normalizedEmail,
                ),
                null,
            );

            const rollback = delivery(
                'registration',
                'rollback@example.test',
                'registration-rollback',
                20_000,
            );
            const duplicateJob = {
                ...rollback.input,
                jobId: initial.input.jobId,
            };
            await assert.rejects(repository.enqueueRegistration(duplicateJob));
            assert.equal(
                await verificationState(
                    database,
                    'registration',
                    rollback.input.normalizedEmail,
                ),
                null,
            );
        });

        postgresTest('password reset activation uses acceptance time and remains unusable while queued', async () => {
            const { database, repository, accountRepository } = await useDatabase(
                'email-delivery-password-reset',
            );
            const email = 'password-reset@example.test';
            const account = emailAccount(email, 1_000);
            assert.equal((await accountRepository.createEmailAccount(account)).status, 'created');
            const reset = delivery('password_reset', email, 'password-reset-initial', 2_000);
            assert.equal(
                (await repository.enqueuePasswordReset(passwordResetDeliveryInput(reset))).status,
                'queued',
            );

            const resetInput = {
                normalizedEmail: email,
                codeHash: reset.input.codeHash,
                passwordHash: hash('replacement-password'),
                parametersJson: '{"cost":12}',
                updatedAt: 3_000,
                event: {
                    id: randomUUID(),
                    accountId: account.id,
                    eventType: 'auth.password_reset.completed' as const,
                    requestId: null,
                    ipAddress: null,
                    userAgent: null,
                    metadataJson: '{}',
                    createdAt: 3_000,
                },
            };
            assert.equal((await accountRepository.completePasswordReset(resetInput)).status, 'invalid');

            const claim = await claimOne(repository, 4_000);
            assert.equal(
                await repository.complete({
                    jobId: claim.jobId,
                    leaseToken: claim.leaseToken,
                    normalizedEmail: email,
                    deliveryToken: claim.deliveryToken,
                    acceptedAt: 5_000,
                }),
                'completed',
            );
            assert.equal(
                (await verificationState(database, 'password_reset', email))?.expires_at,
                905_000,
            );
            assert.equal(
                (await accountRepository.completePasswordReset({
                    ...resetInput,
                    updatedAt: 6_000,
                    event: { ...resetInput.event, createdAt: 6_000 },
                })).status,
                'completed',
            );
        });

        describe('password reset request', () => {
            postgresTest('cooldowns are durable, anonymous, and preserve legacy authority', async () => {
                const { database, repository, accountRepository } = await useDatabase(
                    'email-delivery-password-reset-cooldown',
                );
                await database.prepare(
                    `UPDATE platform_email_configuration
         SET resend_cooldown_seconds=30, updated_at=1 WHERE singleton_id=1`,
                ).run();

                const knownEmail = 'known-cooldown@example.test';
                assert.equal(
                    (await accountRepository.createEmailAccount(emailAccount(knownEmail, 1_000))).status,
                    'created',
                );
                const known = delivery('password_reset', knownEmail, 'known-cooldown', 2_000);
                const unknown = delivery(
                    'password_reset',
                    'unknown-cooldown@example.test',
                    'unknown-cooldown',
                    3_000,
                );
                const knownInput = passwordResetDeliveryInput(known);
                const unknownInput = passwordResetDeliveryInput(unknown);

                assert.throws(
                    () => repository.enqueuePasswordReset({
                        ...knownInput,
                        recipientKey: 'A'.repeat(64) as PlatformPasswordResetRecipientKey,
                    }),
                    /64 lowercase hex/,
                );
                assert.deepEqual(await repository.enqueuePasswordReset(knownInput), {
                    status: 'queued',
                    resendAfter: 32_000,
                    retryAfterSeconds: 30,
                    policyUpdatedAt: 1,
                });
                assert.deepEqual(await repository.enqueuePasswordReset(unknownInput), {
                    status: 'email-not-found',
                    enqueuedAt: 3_000,
                    resendAfter: 33_000,
                    resendCooldownSeconds: 30,
                    retryAfterSeconds: 30,
                    policyUpdatedAt: 1,
                });

                const knownRepeat = delivery(
                    'password_reset',
                    knownEmail,
                    'known-cooldown-repeat',
                    2_001,
                );
                const unknownRepeat = delivery(
                    'password_reset',
                    unknown.input.normalizedEmail,
                    'unknown-cooldown-repeat',
                    3_001,
                );
                assert.deepEqual(
                    await repository.enqueuePasswordReset(
                        passwordResetDeliveryInput(knownRepeat),
                    ),
                    {
                        status: 'cooldown',
                        enqueuedAt: 2_000,
                        resendAfter: 32_000,
                        resendCooldownSeconds: 30,
                        retryAfterMs: 29_999,
                    },
                );
                assert.deepEqual(
                    await repository.enqueuePasswordReset(
                        passwordResetDeliveryInput(unknownRepeat),
                    ),
                    {
                        status: 'cooldown',
                        enqueuedAt: 3_000,
                        resendAfter: 33_000,
                        resendCooldownSeconds: 30,
                        retryAfterMs: 29_999,
                    },
                );

                assert.equal(
                    await database.prepare(
                        `SELECT COUNT(*) AS count FROM platform_password_reset_codes`,
                    ).first<number>('count'),
                    1,
                );
                assert.equal(
                    await database.prepare(
                        `SELECT COUNT(*) AS count FROM platform_email_delivery_jobs
             WHERE purpose='password_reset'`,
                    ).first<number>('count'),
                    1,
                );
                const cooldownRows = await queryAll<RequestCooldownState>(
                    database,
                    `SELECT purpose, recipient_key, enqueued_at, resend_after, updated_at
         FROM platform_email_request_cooldowns
         ORDER BY enqueued_at`,
                );
                assert.deepEqual(
                    cooldownRows.map((row) => row.recipient_key),
                    [knownInput.recipientKey, unknownInput.recipientKey],
                );
                assert.equal(JSON.stringify(cooldownRows).includes(knownEmail), false);
                assert.equal(
                    JSON.stringify(cooldownRows).includes(unknown.input.normalizedEmail),
                    false,
                );

                await database.prepare(
                    `UPDATE platform_email_configuration
         SET resend_cooldown_seconds=600, updated_at=2 WHERE singleton_id=1`,
                ).run();
                const replacement = delivery(
                    'password_reset',
                    unknown.input.normalizedEmail,
                    'unknown-cooldown-replacement',
                    33_000,
                );
                assert.deepEqual(
                    await repository.enqueuePasswordReset(
                        passwordResetDeliveryInput(replacement),
                    ),
                    {
                        status: 'email-not-found',
                        enqueuedAt: 33_000,
                        resendAfter: 633_000,
                        resendCooldownSeconds: 600,
                        retryAfterSeconds: 600,
                        policyUpdatedAt: 2,
                    },
                );
                assert.deepEqual(
                    await requestCooldownState(database, unknownInput.recipientKey),
                    {
                        purpose: 'password_reset',
                        recipient_key: unknownInput.recipientKey,
                        enqueued_at: 33_000,
                        resend_after: 633_000,
                        updated_at: 33_000,
                    },
                );

                const legacyEmail = 'legacy-cooldown@example.test';
                assert.equal(
                    (await accountRepository.createEmailAccount(emailAccount(legacyEmail, 90_000))).status,
                    'created',
                );
                await database.prepare(
                    `INSERT INTO platform_password_reset_codes
            (normalized_email, code_hash, expires_at, resend_after,
             attempts_remaining, consumed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 5, NULL, ?, ?)`,
                ).bind(
                    legacyEmail,
                    hash('legacy-code'),
                    500_000,
                    160_000,
                    100_000,
                    100_000,
                ).run();
                const legacyRequest = delivery(
                    'password_reset',
                    legacyEmail,
                    'legacy-cooldown-request',
                    120_000,
                );
                const legacyInput = passwordResetDeliveryInput(legacyRequest);
                assert.deepEqual(await repository.enqueuePasswordReset(legacyInput), {
                    status: 'cooldown',
                    enqueuedAt: 100_000,
                    resendAfter: 160_000,
                    resendCooldownSeconds: 60,
                    retryAfterMs: 40_000,
                });
                assert.deepEqual(
                    await requestCooldownState(database, legacyInput.recipientKey),
                    {
                        purpose: 'password_reset',
                        recipient_key: legacyInput.recipientKey,
                        enqueued_at: 100_000,
                        resend_after: 160_000,
                        updated_at: 120_000,
                    },
                );
                assert.equal(
                    await database.prepare(
                        `SELECT COUNT(*) AS count FROM platform_email_delivery_jobs
             WHERE purpose='password_reset'`,
                    ).first<number>('count'),
                    1,
                );
            });

            postgresTest('cooldown serializes simultaneous first requests', async () => {
                const { database, repository, accountRepository } = await useDatabase(
                    'email-delivery-password-reset-first-request-race',
                );
                const siblingDatabase = connectPostgresTestDatabase(database);
                const sibling = new SqlPlatformEmailDeliveryRepository(siblingDatabase);
                await database.prepare(
                    `UPDATE platform_email_configuration
         SET resend_cooldown_seconds=30, updated_at=1 WHERE singleton_id=1`,
                ).run();

                const knownEmail = 'known-race@example.test';
                assert.equal(
                    (await accountRepository.createEmailAccount(emailAccount(knownEmail, 1_000))).status,
                    'created',
                );
                const scenarios = [
                    {
                        email: knownEmail,
                        expectedStatuses: ['cooldown', 'queued'],
                    },
                    {
                        email: 'unknown-race@example.test',
                        expectedStatuses: ['cooldown', 'email-not-found'],
                    },
                ] as const;

                for (const scenario of scenarios) {
                    const first = passwordResetDeliveryInput(
                        delivery('password_reset', scenario.email, `${scenario.email}:first`, 10_000),
                    );
                    const second = passwordResetDeliveryInput(
                        delivery('password_reset', scenario.email, `${scenario.email}:second`, 10_000),
                    );
                    const results = await Promise.all([
                        repository.enqueuePasswordReset(first),
                        sibling.enqueuePasswordReset(second),
                    ]);
                    assert.deepEqual(
                        results.map((result) => result.status).sort(),
                        [...scenario.expectedStatuses].sort(),
                    );
                    assert.equal(
                        await database.prepare(
                            `SELECT COUNT(*) AS count
                 FROM platform_email_request_cooldowns
                 WHERE purpose='password_reset' AND recipient_key=?`,
                        ).bind(first.recipientKey).first<number>('count'),
                        1,
                    );
                }

                assert.equal(
                    await database.prepare(
                        `SELECT COUNT(*) AS count FROM platform_password_reset_codes`,
                    ).first<number>('count'),
                    1,
                );
                assert.equal(
                    await database.prepare(
                        `SELECT COUNT(*) AS count FROM platform_email_delivery_jobs
             WHERE purpose='password_reset'`,
                    ).first<number>('count'),
                    1,
                );
            });
        });

        postgresTest('anonymous cooldown survives account creation and uses the next policy after expiry', async () => {
            const { database, repository, accountRepository } = await useDatabase(
                'email-delivery-password-reset-account-transition',
            );
            await database.prepare(
                `UPDATE platform_email_configuration
         SET resend_cooldown_seconds=30, updated_at=1 WHERE singleton_id=1`,
            ).run();
            const email = 'account-transition@example.test';
            const initial = passwordResetDeliveryInput(
                delivery('password_reset', email, 'account-transition:unknown', 1_000),
            );
            assert.equal(
                (await repository.enqueuePasswordReset(initial)).status,
                'email-not-found',
            );
            assert.equal(
                await database.prepare(
                    `SELECT COUNT(*) AS count FROM platform_password_reset_codes
             WHERE normalized_email=?`,
                ).bind(email).first<number>('count'),
                0,
            );
            assert.equal(
                await database.prepare(
                    `SELECT COUNT(*) AS count FROM platform_email_delivery_jobs
             WHERE purpose='password_reset'`,
                ).first<number>('count'),
                0,
            );

            const expiredRecipientKey = '0'.repeat(64);
            await database.prepare(
                `INSERT INTO platform_email_request_cooldowns
            (purpose, recipient_key, enqueued_at, resend_after, updated_at)
         VALUES ('password_reset', ?, 0, 30000, 0)`,
            ).bind(expiredRecipientKey).run();
            await database.prepare(
                `UPDATE platform_email_configuration
         SET resend_cooldown_seconds=600, updated_at=2 WHERE singleton_id=1`,
            ).run();
            assert.equal(
                (await accountRepository.createEmailAccount(emailAccount(email, 2_000))).status,
                'created',
            );

            const duringCooldown = passwordResetDeliveryInput(
                delivery('password_reset', email, 'account-transition:during', 20_000),
            );
            assert.deepEqual(await repository.enqueuePasswordReset(duringCooldown), {
                status: 'cooldown',
                enqueuedAt: 1_000,
                resendAfter: 31_000,
                resendCooldownSeconds: 30,
                retryAfterMs: 11_000,
            });
            assert.equal(
                await database.prepare(
                    `SELECT COUNT(*) AS count FROM platform_email_delivery_jobs
             WHERE purpose='password_reset'`,
                ).first<number>('count'),
                0,
            );

            const afterCooldown = passwordResetDeliveryInput(
                delivery('password_reset', email, 'account-transition:after', 31_000),
            );
            assert.deepEqual(await repository.enqueuePasswordReset(afterCooldown), {
                status: 'queued',
                resendAfter: 631_000,
                retryAfterSeconds: 600,
                policyUpdatedAt: 2,
            });
            assert.deepEqual(
                await requestCooldownState(database, initial.recipientKey),
                {
                    purpose: 'password_reset',
                    recipient_key: initial.recipientKey,
                    enqueued_at: 31_000,
                    resend_after: 631_000,
                    updated_at: 31_000,
                },
            );
            assert.equal(
                await requestCooldownState(database, expiredRecipientKey),
                null,
            );
            assert.equal(
                await database.prepare(
                    `SELECT COUNT(*) AS count FROM platform_password_reset_codes
             WHERE normalized_email=?`,
                ).bind(email).first<number>('count'),
                1,
            );
            assert.equal(
                await database.prepare(
                    `SELECT COUNT(*) AS count FROM platform_email_delivery_jobs
             WHERE purpose='password_reset'`,
                ).first<number>('count'),
                1,
            );
        });

        postgresTest('failed resend preserves the active code and missing candidates never retry', async () => {
            const { database, repository } = await useDatabase('email-delivery-failure');
            const email = 'resend@example.test';
            const initial = delivery('registration', email, 'resend-active', 1_000);
            await repository.enqueueRegistration(initial.input);
            const initialClaim = await claimOne(repository, 2_000);
            await repository.complete({
                jobId: initialClaim.jobId,
                leaseToken: initialClaim.leaseToken,
                normalizedEmail: email,
                deliveryToken: initialClaim.deliveryToken,
                acceptedAt: 3_000,
            });
            const active = await verificationState(database, 'registration', email);
            assert.ok(active);

            const resend = delivery('registration', email, 'resend-failed', 61_001);
            await repository.enqueueRegistration(resend.input);
            const resendClaim = await claimOne(repository, 62_000);
            assert.equal(
                await repository.recordFailure({
                    jobId: resendClaim.jobId,
                    leaseToken: resendClaim.leaseToken,
                    failedAt: 63_000,
                    category: 'authentication',
                    transient: false,
                    acceptanceAmbiguous: false,
                }),
                'failed',
            );
            const afterFailure = await verificationState(database, 'registration', email);
            assert.ok(afterFailure);
            assert.equal(afterFailure.code_hash, active.code_hash);
            assert.equal(afterFailure.expires_at, active.expires_at);
            assert.equal(afterFailure.attempts_remaining, active.attempts_remaining);
            assert.equal(afterFailure.delivery_token, null);
            assert.equal(afterFailure.pending_token, null);
            assert.equal(afterFailure.resend_after, 121_001);

            await database.prepare(
                `UPDATE platform_email_configuration
         SET resend_cooldown_seconds=600, updated_at=1 WHERE singleton_id=1`,
            ).run();
            const longCooldownResend = delivery(
                'registration',
                email,
                'resend-long-cooldown',
                121_002,
            );
            await repository.enqueueRegistration(longCooldownResend.input);
            const longCooldownClaim = await claimOne(repository, 121_003);
            assert.equal(
                await repository.recordFailure({
                    jobId: longCooldownClaim.jobId,
                    leaseToken: longCooldownClaim.leaseToken,
                    failedAt: 121_004,
                    category: 'authentication',
                    transient: false,
                    acceptanceAmbiguous: false,
                }),
                'failed',
            );
            const afterActiveExpiry = delivery(
                'registration',
                email,
                'resend-before-long-cooldown-ends',
                603_001,
            );
            assert.deepEqual(
                await repository.enqueueRegistration(afterActiveExpiry.input),
                {
                    status: 'cooldown',
                    enqueuedAt: 121_002,
                    resendAfter: 721_002,
                    resendCooldownSeconds: 600,
                    retryAfterMs: 118_001,
                },
            );

            const missing = delivery(
                'registration',
                'missing-candidate@example.test',
                'missing-candidate',
                100_000,
            );
            await repository.enqueueRegistration(missing.input);
            const missingClaim = await claimOne(repository, 101_000);
            await database.prepare(
                'DELETE FROM platform_email_verification_codes WHERE normalized_email=?',
            ).bind(missing.input.normalizedEmail).run();
            assert.equal(
                await repository.recordFailure({
                    jobId: missingClaim.jobId,
                    leaseToken: missingClaim.leaseToken,
                    failedAt: 102_000,
                    category: 'network',
                    transient: true,
                    acceptanceAmbiguous: true,
                }),
                'superseded',
            );
            assert.deepEqual(
                await jobState(database, missing.input.jobId),
                {
                    state: 'superseded',
                    attempts: 1,
                    next_attempt_at: 100_000,
                    deadline_at: 160_000,
                    lease_token: null,
                    lease_expires_at: null,
                    failure_category: null,
                    acceptance_ambiguous: false,
                    updated_at: 102_000,
                },
            );
        });

        postgresTest('password reset supersession and terminal failure preserve the active code', async () => {
            const { database, repository, accountRepository } = await useDatabase(
                'email-delivery-password-reset-supersession',
            );
            await database.prepare(
                `UPDATE platform_email_configuration
         SET resend_cooldown_seconds=30, updated_at=1 WHERE singleton_id=1`,
            ).run();
            const email = 'password-reset-supersession@example.test';
            const account = emailAccount(email, 500);
            assert.equal(
                (await accountRepository.createEmailAccount(account)).status,
                'created',
            );

            const activeDelivery = delivery(
                'password_reset',
                email,
                'password-reset-supersession:active',
                1_000,
            );
            await repository.enqueuePasswordReset(
                passwordResetDeliveryInput(activeDelivery),
            );
            const activeClaim = await claimOne(repository, 1_100);
            assert.equal(
                await repository.complete({
                    jobId: activeClaim.jobId,
                    leaseToken: activeClaim.leaseToken,
                    normalizedEmail: email,
                    deliveryToken: activeClaim.deliveryToken,
                    acceptedAt: 2_000,
                }),
                'completed',
            );

            const runningResend = delivery(
                'password_reset',
                email,
                'password-reset-supersession:running',
                31_001,
            );
            await repository.enqueuePasswordReset(
                passwordResetDeliveryInput(runningResend),
            );
            const runningClaim = await claimOne(repository, 31_100, 60_000);
            const replacement = delivery(
                'password_reset',
                email,
                'password-reset-supersession:replacement',
                61_002,
            );
            assert.equal(
                (await repository.enqueuePasswordReset(
                    passwordResetDeliveryInput(replacement),
                )).status,
                'queued',
            );
            assert.equal(
                (await jobState(database, runningResend.input.jobId))?.state,
                'superseded',
            );
            assert.equal(
                await repository.complete({
                    jobId: runningClaim.jobId,
                    leaseToken: runningClaim.leaseToken,
                    normalizedEmail: email,
                    deliveryToken: runningClaim.deliveryToken,
                    acceptedAt: 61_003,
                }),
                'superseded',
            );

            const replacementClaim = await claimOne(repository, 61_100);
            assert.equal(
                await repository.recordFailure({
                    jobId: replacementClaim.jobId,
                    leaseToken: replacementClaim.leaseToken,
                    failedAt: 61_101,
                    category: 'authentication',
                    transient: false,
                    acceptanceAmbiguous: false,
                }),
                'failed',
            );
            assert.equal(
                await repository.complete({
                    jobId: replacementClaim.jobId,
                    leaseToken: replacementClaim.leaseToken,
                    normalizedEmail: email,
                    deliveryToken: replacementClaim.deliveryToken,
                    acceptedAt: 61_102,
                }),
                'lease-lost',
            );

            const preserved = await verificationState(database, 'password_reset', email);
            assert.ok(preserved);
            assert.equal(preserved.code_hash, activeDelivery.input.codeHash);
            assert.equal(preserved.expires_at, 902_000);
            assert.equal(preserved.delivery_token, null);
            assert.equal(preserved.pending_token, null);
            assert.equal(preserved.pending_code_hash, null);

            assert.equal(
                (await accountRepository.completePasswordReset({
                    normalizedEmail: email,
                    codeHash: activeDelivery.input.codeHash,
                    passwordHash: hash('replacement-after-failed-resend'),
                    parametersJson: '{"cost":12}',
                    updatedAt: 61_103,
                    event: {
                        id: randomUUID(),
                        accountId: account.id,
                        eventType: 'auth.password_reset.completed',
                        requestId: null,
                        ipAddress: null,
                        userAgent: null,
                        metadataJson: '{}',
                        createdAt: 61_103,
                    },
                })).status,
                'completed',
            );
        });

        postgresTest('competing claims, lease expiry, renewal, and stale owners are fenced', async () => {
            const { database, repository } = await useDatabase('email-delivery-leases');
            const siblingDatabase = connectPostgresTestDatabase(database);
            const sibling = new SqlPlatformEmailDeliveryRepository(siblingDatabase);
            const queued = delivery(
                'registration',
                'claims@example.test',
                'claims-competing',
                1_000,
            );
            await repository.enqueueRegistration(queued.input);

            const claims = (await Promise.all([
                repository.claim({ now: 2_000, limit: 1, leaseDurationMs: 1_000 }),
                sibling.claim({ now: 2_000, limit: 1, leaseDurationMs: 1_000 }),
            ])).flat();
            assert.equal(claims.length, 1);
            const first = claims[0];
            assert.equal(
                await repository.renewLease({
                    jobId: first.jobId,
                    leaseToken: first.leaseToken,
                    now: 2_500,
                    leaseDurationMs: 1_000,
                }),
                true,
            );
            assert.equal(
                await repository.renewLease({
                    jobId: first.jobId,
                    leaseToken: first.leaseToken,
                    now: 3_500,
                    leaseDurationMs: 1_000,
                }),
                false,
            );

            const second = await claimOne(sibling, 3_501, 1_000);
            assert.equal(second.attempts, 2);
            assert.equal(
                await repository.complete({
                    jobId: first.jobId,
                    leaseToken: first.leaseToken,
                    normalizedEmail: queued.input.normalizedEmail,
                    deliveryToken: first.deliveryToken,
                    acceptedAt: 3_600,
                }),
                'lease-lost',
            );
            assert.equal(
                await sibling.complete({
                    jobId: second.jobId,
                    leaseToken: second.leaseToken,
                    normalizedEmail: queued.input.normalizedEmail,
                    deliveryToken: second.deliveryToken,
                    acceptedAt: 3_700,
                }),
                'completed',
            );

            const deadline = delivery(
                'registration',
                'deadline-renewal@example.test',
                'deadline-renewal',
                100_000,
            );
            await repository.enqueueRegistration(deadline.input);
            const deadlineClaim = await claimOne(repository, 100_001, 120_000);
            assert.equal(
                await repository.renewLease({
                    jobId: deadlineClaim.jobId,
                    leaseToken: deadlineClaim.leaseToken,
                    now: 160_000,
                    leaseDurationMs: 1_000,
                }),
                false,
            );
        });

        postgresTest('retry, attempt, deadline, expiry, and retention limits are enforced', async () => {
            const { database, repository } = await useDatabase('email-delivery-retry');
            const retry = delivery('registration', 'retry@example.test', 'retry-job', 1_000);
            await repository.enqueueRegistration(retry.input);
            const first = await claimOne(repository, 2_000);
            assert.equal(
                await repository.recordFailure({
                    jobId: first.jobId,
                    leaseToken: first.leaseToken,
                    failedAt: 3_000,
                    category: 'network',
                    transient: true,
                    acceptanceAmbiguous: true,
                }),
                'retry-scheduled',
            );
            assert.equal((await repository.claim({
                now: 22_999,
                limit: 1,
                leaseDurationMs: 1_000,
            })).length, 0);
            const second = await claimOne(repository, 23_000, 1_000);
            assert.equal(second.attempts, 2);
            assert.equal(
                await repository.recordFailure({
                    jobId: second.jobId,
                    leaseToken: second.leaseToken,
                    failedAt: 24_000,
                    category: 'smtp_transient',
                    transient: true,
                    acceptanceAmbiguous: false,
                }),
                'failed',
            );
            assert.equal((await jobState(database, retry.input.jobId))?.failure_category, 'smtp_transient');

            const tooLate = delivery(
                'registration',
                'late-retry@example.test',
                'late-retry-job',
                100_000,
            );
            await repository.enqueueRegistration(tooLate.input);
            const lateClaim = await claimOne(repository, 140_000, 30_000);
            assert.equal(
                await repository.recordFailure({
                    jobId: lateClaim.jobId,
                    leaseToken: lateClaim.leaseToken,
                    failedAt: 145_000,
                    category: 'network',
                    transient: true,
                    acceptanceAmbiguous: false,
                }),
                'failed',
            );

            const expired = delivery(
                'registration',
                'expired@example.test',
                'expired-job',
                200_000,
            );
            await repository.enqueueRegistration(expired.input);
            assert.equal(await repository.failExpired(260_000, 1), 1);
            assert.equal((await jobState(database, expired.input.jobId))?.failure_category, 'deadline');
            assert.equal(
                (await verificationState(
                    database,
                    'registration',
                    expired.input.normalizedEmail,
                ))?.attempts_remaining,
                0,
            );

            assert.equal(await repository.deleteTerminal(200_001, 2), 2);
            const terminal = await queryAll<{ id: string }>(
                database,
                `SELECT id FROM platform_email_delivery_jobs
         WHERE state IN ('completed', 'failed', 'superseded')`,
            );
            assert.equal(terminal.length, 1);
        });

        postgresTest('a 30-second policy supersedes queued, retrying, and running deliveries', async () => {
            const { database, repository } = await useDatabase('email-delivery-supersession');
            await database.prepare(
                `UPDATE platform_email_configuration
         SET resend_cooldown_seconds=30, updated_at=1 WHERE singleton_id=1`,
            ).run();

            for (const [state, base] of [
                ['queued', 1_000],
                ['retry_wait', 100_000],
                ['running', 200_000],
            ] as const) {
                const email = `${state}@example.test`;
                const oldDelivery = delivery('registration', email, `${state}:old`, base);
                await repository.enqueueRegistration(oldDelivery.input);
                let oldClaim;
                if (state !== 'queued') {
                    oldClaim = await claimOne(repository, base + 100, 60_000);
                }
                if (state === 'retry_wait') {
                    assert.equal(
                        await repository.recordFailure({
                            jobId: oldClaim!.jobId,
                            leaseToken: oldClaim!.leaseToken,
                            failedAt: base + 200,
                            category: 'network',
                            transient: true,
                            acceptanceAmbiguous: false,
                        }),
                        'retry-scheduled',
                    );
                }
                const replacement = delivery(
                    'registration',
                    email,
                    `${state}:replacement`,
                    base + 30_001,
                );
                assert.equal(
                    (await repository.enqueueRegistration(replacement.input)).status,
                    'queued',
                );
                assert.equal((await jobState(database, oldDelivery.input.jobId))?.state, 'superseded');
                assert.equal(
                    (await verificationState(database, 'registration', email))?.delivery_token,
                    replacement.input.deliveryToken,
                );
                if (state === 'running') {
                    assert.equal(
                        await repository.complete({
                            jobId: oldClaim!.jobId,
                            leaseToken: oldClaim!.leaseToken,
                            normalizedEmail: email,
                            deliveryToken: oldClaim!.deliveryToken,
                            acceptedAt: base + 30_002,
                        }),
                        'superseded',
                    );
                }
            }
        });

        postgresTest('completion-first and supersession-first ordering preserve the intended candidate', async () => {
            const { database, repository } = await useDatabase('email-delivery-ordering');
            await database.prepare(
                'UPDATE platform_email_configuration SET resend_cooldown_seconds=30 WHERE singleton_id=1',
            ).run();

            const completionEmail = 'completion-first@example.test';
            const completed = delivery(
                'registration',
                completionEmail,
                'completion-first:old',
                1_000,
            );
            await repository.enqueueRegistration(completed.input);
            const completedClaim = await claimOne(repository, 2_000);
            await repository.complete({
                jobId: completedClaim.jobId,
                leaseToken: completedClaim.leaseToken,
                normalizedEmail: completionEmail,
                deliveryToken: completedClaim.deliveryToken,
                acceptedAt: 3_000,
            });
            const completionReplacement = delivery(
                'registration',
                completionEmail,
                'completion-first:new',
                31_001,
            );
            await repository.enqueueRegistration(completionReplacement.input);
            const completionState = await verificationState(
                database,
                'registration',
                completionEmail,
            );
            assert.ok(completionState);
            assert.equal(completionState.code_hash, completed.input.codeHash);
            assert.equal(completionState.pending_token, completionReplacement.input.deliveryToken);
            assert.equal((await jobState(database, completed.input.jobId))?.state, 'completed');

            const supersessionEmail = 'supersession-first@example.test';
            const active = delivery(
                'registration',
                supersessionEmail,
                'supersession-first:active',
                100_000,
            );
            await repository.enqueueRegistration(active.input);
            const activeClaim = await claimOne(repository, 101_000);
            await repository.complete({
                jobId: activeClaim.jobId,
                leaseToken: activeClaim.leaseToken,
                normalizedEmail: supersessionEmail,
                deliveryToken: activeClaim.deliveryToken,
                acceptedAt: 102_000,
            });
            const runningResend = delivery(
                'registration',
                supersessionEmail,
                'supersession-first:running',
                130_001,
            );
            await repository.enqueueRegistration(runningResend.input);
            const runningClaim = await claimOne(repository, 130_100, 60_000);
            const replacement = delivery(
                'registration',
                supersessionEmail,
                'supersession-first:replacement',
                160_002,
            );
            await repository.enqueueRegistration(replacement.input);
            assert.equal(
                await repository.complete({
                    jobId: runningClaim.jobId,
                    leaseToken: runningClaim.leaseToken,
                    normalizedEmail: supersessionEmail,
                    deliveryToken: runningClaim.deliveryToken,
                    acceptedAt: 160_003,
                }),
                'superseded',
            );
            const supersessionState = await verificationState(
                database,
                'registration',
                supersessionEmail,
            );
            assert.ok(supersessionState);
            assert.equal(supersessionState.code_hash, active.input.codeHash);
            assert.equal(supersessionState.pending_token, replacement.input.deliveryToken);
        });
    });
}

// platform-email-delivery-service.test.ts
{
    type TransportFactory = NonNullable<
        ConstructorParameters<typeof ConfiguredPlatformEmailService>[2]
    >;
    type HostResolver = NonNullable<
        ConstructorParameters<typeof ConfiguredPlatformEmailService>[3]
    >;

    const recipient = 'producer@example.com';

    function deferred<T>() {
        let resolve!: (value: T | PromiseLike<T>) => void;
        let reject!: (reason?: unknown) => void;
        const promise = new Promise<T>((settle, fail) => {
            resolve = settle;
            reject = fail;
        });
        return { promise, resolve, reject };
    }

    async function waitFor(
        predicate: () => boolean,
        message: string,
        timeoutMs = 1_000,
    ): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (!predicate()) {
            if (Date.now() >= deadline) assert.fail(message);
            await new Promise((resolve) => setTimeout(resolve, 2));
        }
    }

    function configuration(
        overrides: Partial<PlatformEmailConfigurationRecord> = {},
    ): PlatformEmailConfigurationRecord {
        return {
            enabled: true,
            host: 'smtp.example.com',
            port: 465,
            security: 'tls',
            usernameCiphertext: 'encrypted-user',
            passwordCiphertext: 'encrypted-password',
            fromAddress: 'mail@example.com',
            fromName: 'IMSWeb',
            resendCooldownSeconds: 60,
            updatedAt: 1,
            ...overrides,
        };
    }

    const secretBox = {
        encrypt(value: string) {
            return `encrypted:${value}`;
        },
        decrypt(value: string) {
            if (value === 'encrypted-user') return 'mail@example.com';
            if (value === 'encrypted-password') return 'smtp-password';
            if (value.startsWith('encrypted:')) return value.slice('encrypted:'.length);
            throw new Error('invalid ciphertext');
        },
    };

    function createService(options: {
        getConfiguration?: () => Promise<PlatformEmailConfigurationRecord>;
        transportFactory?: TransportFactory;
        hostResolver?: HostResolver;
    } = {}): ConfiguredPlatformEmailService {
        const store: PlatformEmailConfigurationStore = {
            getPlatformEmailConfiguration:
                options.getConfiguration ?? (async () => configuration()),
            async updatePlatformEmailConfiguration(input) {
                return { status: 'saved', configuration: input };
            },
        };
        return new ConfiguredPlatformEmailService(
            store,
            secretBox,
            options.transportFactory ?? (() => ({
                async verify() {
                    return true;
                },
                async sendMail() {
                    return { accepted: [recipient] };
                },
                close() {},
            })),
            options.hostResolver ?? (async () => ['93.184.216.34']),
        );
    }

    function deliver(
        service: ConfiguredPlatformEmailService,
        deadlineAt = Date.now() + 1_000,
        signal = new AbortController().signal,
    ) {
        return service.deliverVerification({
            purpose: 'registration',
            message: {
                email: recipient,
                code: '123456',
                expiresInMinutes: 10,
            },
            deadlineAt,
            signal,
        });
    }

    test.describe('worker SMTP delivery', () => {
        test('classifies only bounded failure evidence', async () => {
            const cases = [
                {
                    error: { code: 'EAUTH', responseCode: 454, response: 'raw temporary auth response' },
                    expected: {
                        status: 'failed',
                        category: 'smtp_transient',
                        transient: true,
                        acceptanceAmbiguous: false,
                    },
                },
                {
                    error: { code: 'EAUTH', responseCode: 535, response: 'raw auth response' },
                    expected: {
                        status: 'failed',
                        category: 'authentication',
                        transient: false,
                        acceptanceAmbiguous: false,
                    },
                },
                {
                    error: { code: 'EMESSAGE', responseCode: 550, response: 'raw SMTP response' },
                    expected: {
                        status: 'failed',
                        category: 'smtp_permanent',
                        transient: false,
                        acceptanceAmbiguous: false,
                    },
                },
                {
                    error: { code: 'ERR_TLS_CERT_ALTNAME_INVALID' },
                    expected: {
                        status: 'failed',
                        category: 'tls',
                        transient: false,
                        acceptanceAmbiguous: false,
                    },
                },
                {
                    error: { code: 'EPIPE', command: 'DATA', response: 'possibly accepted' },
                    expected: {
                        status: 'failed',
                        category: 'network',
                        transient: true,
                        acceptanceAmbiguous: true,
                    },
                },
            ] as const;

            for (const entry of cases) {
                const service = createService({
                    transportFactory: () => ({
                        async verify() {
                            return true;
                        },
                        async sendMail() {
                            throw entry.error;
                        },
                        close() {},
                    }),
                });

                const result = await deliver(service);

                assert.deepEqual(result, entry.expected);
                assert.deepEqual(Object.keys(result).sort(), [
                    'acceptanceAmbiguous',
                    'category',
                    'status',
                    'transient',
                ]);
                assert.equal('response' in result, false);
            }
        });

        test('contains unexpected factory, DNS, and configuration-store errors', async () => {
            const factoryFailure = await deliver(createService({
                transportFactory: () => {
                    throw new Error('factory returned raw provider output');
                },
            }));
            assert.deepEqual(factoryFailure, {
                status: 'failed',
                category: 'unknown',
                transient: false,
                acceptanceAmbiguous: false,
            });

            const dnsFailure = await deliver(createService({
                hostResolver: async () => {
                    throw { code: 'EAI_AGAIN', hostname: 'smtp.example.com' };
                },
            }));
            assert.deepEqual(dnsFailure, {
                status: 'failed',
                category: 'dns',
                transient: true,
                acceptanceAmbiguous: false,
            });

            const storeFailure = await deliver(createService({
                getConfiguration: async () => {
                    throw new Error('database unavailable');
                },
            }));
            assert.deepEqual(storeFailure, {
                status: 'failed',
                category: 'configuration',
                transient: false,
                acceptanceAmbiguous: false,
            });
        });

        test('rejects IPv4 and IPv6 non-public DNS answers', async () => {
            const nonPublicAddresses = [
                '0.0.0.1',
                '10.0.0.1',
                '100.64.0.1',
                '127.0.0.1',
                '169.254.1.1',
                '172.16.0.1',
                '192.0.0.1',
                '192.0.2.1',
                '192.88.99.1',
                '192.168.0.1',
                '198.18.0.1',
                '198.51.100.1',
                '203.0.113.1',
                '224.0.0.1',
                '240.0.0.1',
                '::2',
                '::ffff:127.0.0.1',
                '64:ff9b::1',
                '64:ff9b:1::1',
                '100::1',
                '2001::1',
                '2001:0:ffff::1',
                '2001:100::1',
                '2001:1ff::1',
                '2001:2::1',
                '2001:10::1',
                '2001:20::1',
                '2001:db8::1',
                '2002::1',
                '3fff::1',
                '4000::1',
                '5f00::1',
                'fc00::1',
                'fe80::1',
                'ff00::1',
            ];

            for (const address of nonPublicAddresses) {
                let transportCreated = false;
                const result = await deliver(createService({
                    hostResolver: async () => [address],
                    transportFactory: () => {
                        transportCreated = true;
                        throw new Error('transport should not be created');
                    },
                }));
                assert.deepEqual(result, {
                    status: 'failed',
                    category: 'dns_policy',
                    transient: false,
                    acceptanceAmbiguous: false,
                }, address);
                assert.equal(transportCreated, false, address);
            }

            const mixed = await deliver(createService({
                hostResolver: async () => ['2606:4700:4700::1111', '10.0.0.1'],
            }));
            assert.equal(mixed.status, 'failed');
            if (mixed.status === 'failed') assert.equal(mixed.category, 'dns_policy');
        });

        test('pins a public DNS address while retaining the TLS hostname', async () => {
            let observed: Parameters<TransportFactory>[0] | undefined;
            const service = createService({
                hostResolver: async () => ['2606:4700:4700::1111'],
                transportFactory: (config) => {
                    observed = config;
                    return {
                        async verify() {
                            return true;
                        },
                        async sendMail() {
                            return { accepted: [{ address: 'PRODUCER@example.com' }] };
                        },
                        close() {},
                    };
                },
            });

            const before = Date.now();
            const result = await deliver(service);

            assert.equal(result.status, 'accepted');
            if (result.status === 'accepted') assert.ok(result.acceptedAt >= before);
            assert.equal(observed?.host, 'smtp.example.com');
            assert.equal(observed?.resolvedAddress, '2606:4700:4700::1111');
            assert.equal(observed?.security, 'tls');
        });

        test('enforces one absolute deadline across database, DNS, transport, and send', async () => {
            const never = new Promise<never>(() => undefined);
            const databaseDeadline = await deliver(createService({
                getConfiguration: () => never,
            }), Date.now() + 15);
            assert.deepEqual(databaseDeadline, {
                status: 'failed',
                category: 'deadline',
                transient: false,
                acceptanceAmbiguous: false,
            });

            const dnsDeadline = await deliver(createService({
                hostResolver: () => never,
            }), Date.now() + 15);
            assert.deepEqual(dnsDeadline, {
                status: 'failed',
                category: 'deadline',
                transient: false,
                acceptanceAmbiguous: false,
            });

            let slowFactoryClosed = 0;
            const transportDeadline = await deliver(createService({
                transportFactory: () => {
                    const blockedUntil = Date.now() + 15;
                    while (Date.now() < blockedUntil) {
                        // A synchronous factory cannot be interrupted, so the deadline is checked again.
                    }
                    return {
                        async verify() {
                            return true;
                        },
                        async sendMail() {
                            return { accepted: [recipient] };
                        },
                        close() {
                            slowFactoryClosed += 1;
                        },
                    };
                },
            }), Date.now() + 5);
            assert.deepEqual(transportDeadline, {
                status: 'failed',
                category: 'deadline',
                transient: false,
                acceptanceAmbiguous: false,
            });
            assert.equal(slowFactoryClosed, 1);

            let sendClosed = 0;
            const sendDeadline = await deliver(createService({
                transportFactory: () => ({
                    async verify() {
                        return true;
                    },
                    sendMail() {
                        return never;
                    },
                    close() {
                        sendClosed += 1;
                    },
                }),
            }), Date.now() + 15);
            assert.deepEqual(sendDeadline, {
                status: 'failed',
                category: 'deadline',
                transient: false,
                acceptanceAmbiguous: true,
            });
            assert.ok(sendClosed >= 1);
        });

        test('rejects acceptance resolved after the absolute deadline', async () => {
            let transportClosed = 0;
            const result = await deliver(createService({
                transportFactory: () => ({
                    async verify() {
                        return true;
                    },
                    async sendMail() {
                        const blockedUntil = Date.now() + 20;
                        while (Date.now() < blockedUntil) {
                            // A synchronous provider callback cannot be interrupted by a timer.
                        }
                        return { accepted: [recipient] };
                    },
                    close() {
                        transportClosed += 1;
                    },
                }),
            }), Date.now() + 5);

            assert.deepEqual(result, {
                status: 'failed',
                category: 'deadline',
                transient: false,
                acceptanceAmbiguous: true,
            });
            assert.equal(transportClosed, 1);
        });

        test('contains a rejection that arrives after deadline closure', async () => {
            const send = deferred<never>();
            const unhandled: unknown[] = [];
            const onUnhandled = (error: unknown) => unhandled.push(error);
            process.on('unhandledRejection', onUnhandled);
            try {
                const result = await deliver(createService({
                    transportFactory: () => ({
                        async verify() {
                            return true;
                        },
                        sendMail() {
                            return send.promise;
                        },
                        close() {},
                    }),
                }), Date.now() + 10);
                assert.deepEqual(result, {
                    status: 'failed',
                    category: 'deadline',
                    transient: false,
                    acceptanceAmbiguous: true,
                });

                send.reject(new Error('late provider response with sensitive text'));
                await new Promise((resolve) => setImmediate(resolve));
                await new Promise((resolve) => setImmediate(resolve));
                assert.deepEqual(unhandled, []);
            } finally {
                process.off('unhandledRejection', onUnhandled);
            }
        });

        test('closes the transport when its abort signal fires', async () => {
            const controller = new AbortController();
            let transportClosed = 0;
            let sendStarted = false;
            const delivery = deliver(createService({
                transportFactory: () => ({
                    async verify() {
                        return true;
                    },
                    sendMail() {
                        sendStarted = true;
                        return new Promise(() => undefined);
                    },
                    close() {
                        transportClosed += 1;
                    },
                }),
            }), Date.now() + 1_000, controller.signal);
            await waitFor(() => sendStarted, 'SMTP send did not start before cancellation');

            controller.abort();

            assert.deepEqual(await delivery, {
                status: 'failed',
                category: 'unknown',
                transient: false,
                acceptanceAmbiguous: false,
            });
            assert.equal(transportClosed, 1);
        });

        test('requires explicit acceptance of the intended recipient', async () => {
            for (const accepted of [undefined, [], ['other@example.com']]) {
                const result = await deliver(createService({
                    transportFactory: () => ({
                        async verify() {
                            return true;
                        },
                        async sendMail() {
                            return { accepted };
                        },
                        close() {},
                    }),
                }));
                assert.deepEqual(result, {
                    status: 'failed',
                    category: 'recipient_rejected',
                    transient: false,
                    acceptanceAmbiguous: false,
                });
            }
        });
    });
}

// platform-email-job-payload.test.ts
{
    const SECRET = 'platform-email-job-payload-test-secret-0123456789';
    const REGISTRATION_IDENTITY: PlatformEmailJobIdentity = {
        jobId: '1'.repeat(64),
        purpose: 'registration',
        deliveryToken: '2'.repeat(64),
        payloadVersion: 1,
    };
    const REGISTRATION_PAYLOAD: PlatformEmailJobPayload = {
        purpose: 'registration',
        normalizedEmail: 'producer@example.test',
        code: '123456',
        expiresInMinutes: 10,
    };

    function mutateCiphertext(value: string): string {
        const parts = value.split('.');
        const ciphertext = parts[3];
        const index = Math.floor(ciphertext.length / 2);
        const replacement = ciphertext[index] === 'A' ? 'B' : 'A';
        parts[3] = `${ciphertext.slice(0, index)}${replacement}${ciphertext.slice(index + 1)}`;
        return parts.join('.');
    }

    test.describe('platform email job payload', () => {
        test.describe('cipher', () => {
            test('round trips one prepared delivery identity', () => {
                const cipher = new PlatformEmailJobPayloadCipherAdapter(SECRET);
                const encrypted = cipher.encrypt(REGISTRATION_IDENTITY, REGISTRATION_PAYLOAD);

                assert.deepEqual(
                    {
                        jobId: encrypted.jobId,
                        purpose: encrypted.purpose,
                        deliveryToken: encrypted.deliveryToken,
                        payloadVersion: encrypted.payloadVersion,
                        normalizedEmail: encrypted.normalizedEmail,
                    },
                    {
                        ...REGISTRATION_IDENTITY,
                        normalizedEmail: REGISTRATION_PAYLOAD.normalizedEmail,
                    },
                );
                assert.doesNotMatch(encrypted.payloadCiphertext, /producer@example\.test|123456/);
                assert.deepEqual(
                    cipher.decrypt(REGISTRATION_IDENTITY, encrypted.payloadCiphertext),
                    REGISTRATION_PAYLOAD,
                );
            });

            test('separates credential context and authenticates identity', () => {
                const cipher = new PlatformEmailJobPayloadCipherAdapter(SECRET);
                const encrypted = cipher.encrypt(REGISTRATION_IDENTITY, REGISTRATION_PAYLOAD);
                const credentialCipher = new PlatformEmailSecretCipher(SECRET);

                assert.throws(() => credentialCipher.decrypt(encrypted.payloadCiphertext));
                assert.throws(
                    () => cipher.decrypt(
                        { ...REGISTRATION_IDENTITY, jobId: '3'.repeat(64) },
                        encrypted.payloadCiphertext,
                    ),
                    /ciphertext is invalid/,
                );
                assert.throws(
                    () => cipher.decrypt(
                        { ...REGISTRATION_IDENTITY, deliveryToken: '4'.repeat(64) },
                        encrypted.payloadCiphertext,
                    ),
                    /ciphertext is invalid/,
                );
                assert.throws(
                    () => cipher.decrypt(
                        { ...REGISTRATION_IDENTITY, purpose: 'password_reset' },
                        encrypted.payloadCiphertext,
                    ),
                    /ciphertext is invalid/,
                );
            });

            test('rejects authenticated ciphertext tampering', () => {
                const cipher = new PlatformEmailJobPayloadCipherAdapter(SECRET);
                const encrypted = cipher.encrypt(REGISTRATION_IDENTITY, REGISTRATION_PAYLOAD);

                assert.throws(
                    () => cipher.decrypt(
                        REGISTRATION_IDENTITY,
                        mutateCiphertext(encrypted.payloadCiphertext),
                    ),
                    /ciphertext is invalid/,
                );
            });

            test('preserves multibyte recipients', () => {
                const cipher = new PlatformEmailJobPayloadCipherAdapter(SECRET);
                const identity: PlatformEmailJobIdentity = {
                    jobId: '5'.repeat(64),
                    purpose: 'password_reset',
                    deliveryToken: '6'.repeat(64),
                    payloadVersion: 1,
                };
                const payload: PlatformEmailJobPayload = {
                    purpose: 'password_reset',
                    normalizedEmail: '制作人@例子.测试',
                    code: '654321',
                    expiresInMinutes: 15,
                };
                const encrypted = cipher.encrypt(identity, payload);

                assert.equal(encrypted.normalizedEmail, payload.normalizedEmail);
                assert.deepEqual(cipher.decrypt(identity, encrypted.payloadCiphertext), payload);
            });
        });

        test('purpose fixes the verification lifetime', () => {
            const cipher = new PlatformEmailJobPayloadCipherAdapter(SECRET);

            assert.throws(
                () => cipher.encrypt(
                    REGISTRATION_IDENTITY,
                    {
                        ...REGISTRATION_PAYLOAD,
                        expiresInMinutes: 15,
                    } as unknown as PlatformEmailJobPayload,
                ),
                /payload is invalid/,
            );
            assert.throws(
                () => cipher.encrypt(
                    {
                        ...REGISTRATION_IDENTITY,
                        purpose: 'password_reset',
                    },
                    {
                        purpose: 'password_reset',
                        normalizedEmail: REGISTRATION_PAYLOAD.normalizedEmail,
                        code: REGISTRATION_PAYLOAD.code,
                        expiresInMinutes: 10,
                    } as unknown as PlatformEmailJobPayload,
                ),
                /payload is invalid/,
            );
        });
    });
}

// platform-email-resend-policy-cache.test.ts
{
    const PREFIX = 'imsweb:test:';
    const CACHE_KEY = `${PREFIX}platform-email-resend-policy:v1`;

    interface StoredValue {
        value: string;
        expiresAt: number;
    }

    function strictPolicy(value: unknown): value is PlatformEmailResendPolicyRecord {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const record = value as Record<string, unknown>;
        return Object.keys(record).length === 2
            && Number.isSafeInteger(record.resendCooldownSeconds)
            && Number(record.resendCooldownSeconds) >= 30
            && Number(record.resendCooldownSeconds) <= 600
            && Number.isSafeInteger(record.updatedAt)
            && Number(record.updatedAt) >= 0;
    }

    class FakeValkeyPolicyServer {
        readonly commands: string[][] = [];
        readonly commandSignals: Array<AbortSignal | undefined> = [];
        readonly values = new Map<string, StoredValue>();
        now = 10_000;
        failReads = false;
        failWrites = false;
        nextEvalReply: unknown;

        seed(key: string, value: string, ttlSeconds = 5): void {
            this.values.set(key, {
                value,
                expiresAt: this.now + ttlSeconds * 1_000,
            });
        }

        advance(milliseconds: number): void {
            this.now += milliseconds;
        }

        async sendCommand<T = unknown>(
            args: readonly string[],
            options?: { abortSignal?: AbortSignal },
        ): Promise<T> {
            const command = [...args];
            this.commands.push(command);
            this.commandSignals.push(options?.abortSignal);
            if (command[0] === 'GET') {
                if (this.failReads) throw new Error('Valkey read failed');
                const key = command[1]!;
                const stored = this.values.get(key);
                if (!stored || stored.expiresAt <= this.now) {
                    this.values.delete(key);
                    return null as T;
                }
                return stored.value as T;
            }
            if (command[0] === 'EVAL') {
                if (this.failWrites) throw new Error('Valkey write failed');
                if (this.nextEvalReply !== undefined) {
                    const reply = this.nextEvalReply;
                    this.nextEvalReply = undefined;
                    return reply as T;
                }
                assert.equal(command[1], VALKEY_PLATFORM_EMAIL_RESEND_POLICY_WRITE_SCRIPT);
                assert.equal(command[2], '1');
                assert.equal(command.length, 7);
                const key = command[3]!;
                const incomingRaw = command[4]!;
                const incomingUpdatedAt = Number(command[5]);
                const ttlSeconds = Number(command[6]);
                assert.equal(ttlSeconds, 5);
                const current = this.values.get(key);
                let currentPolicy: PlatformEmailResendPolicyRecord | null = null;
                if (current && current.expiresAt > this.now) {
                    try {
                        const parsed: unknown = JSON.parse(current.value);
                        if (strictPolicy(parsed)) currentPolicy = parsed;
                    } catch {
                        currentPolicy = null;
                    }
                }
                if (currentPolicy && currentPolicy.updatedAt > incomingUpdatedAt) {
                    return 0 as T;
                }
                this.seed(key, incomingRaw, ttlSeconds);
                return 1 as T;
            }
            throw new Error(`Unsupported fake Valkey command: ${String(command[0])}`);
        }
    }

    function configuration(
        overrides: Partial<PlatformEmailConfigurationRecord> = {},
    ): PlatformEmailConfigurationRecord {
        return {
            enabled: false,
            host: '',
            port: 465,
            security: 'tls',
            usernameCiphertext: null,
            passwordCiphertext: null,
            fromAddress: '',
            fromName: '',
            resendCooldownSeconds: 60,
            updatedAt: 1,
            ...overrides,
        };
    }

    function configurationStore(
        current: PlatformEmailConfigurationRecord,
    ): PlatformEmailConfigurationStore & { reads: number } {
        return {
            reads: 0,
            async getPlatformEmailConfiguration() {
                this.reads += 1;
                return current;
            },
            async updatePlatformEmailConfiguration() {
                throw new Error('update should not be called');
            },
        };
    }

    test.describe('Valkey resend policy cache', () => {
        test('shares revisions across adapter instances', async () => {
            const server = new FakeValkeyPolicyServer();
            const first = new ValkeyPlatformEmailResendPolicyCache(server, {
                keyPrefix: PREFIX,
            });
            const second = new ValkeyPlatformEmailResendPolicyCache(server, {
                keyPrefix: PREFIX,
            });

            assert.equal(await first.writeIfNewer({
                resendCooldownSeconds: 60,
                updatedAt: 2,
            }), true);
            assert.deepEqual(await second.read(), {
                resendCooldownSeconds: 60,
                updatedAt: 2,
            });
            assert.equal(server.commands[0]?.[3], CACHE_KEY);
        });

        test('rejects delayed stale fills and refreshes equal revisions', async () => {
            const server = new FakeValkeyPolicyServer();
            const first = new ValkeyPlatformEmailResendPolicyCache(server, {
                keyPrefix: PREFIX,
            });
            const delayed = new ValkeyPlatformEmailResendPolicyCache(server, {
                keyPrefix: PREFIX,
            });

            await first.writeIfNewer({ resendCooldownSeconds: 30, updatedAt: 20 });
            assert.equal(await delayed.writeIfNewer({
                resendCooldownSeconds: 600,
                updatedAt: 19,
            }), false);
            assert.deepEqual(await first.read(), {
                resendCooldownSeconds: 30,
                updatedAt: 20,
            });

            server.advance(4_000);
            assert.equal(await delayed.writeIfNewer({
                resendCooldownSeconds: 30,
                updatedAt: 20,
            }), true);
            server.advance(4_999);
            assert.deepEqual(await first.read(), {
                resendCooldownSeconds: 30,
                updatedAt: 20,
            });
            server.advance(1);
            assert.equal(await first.read(), null);
        });

        test('replaces malformed data and validates replies', async () => {
            const server = new FakeValkeyPolicyServer();
            const cache = new ValkeyPlatformEmailResendPolicyCache(server, {
                keyPrefix: PREFIX,
            });

            server.seed(CACHE_KEY, '{malformed');
            assert.equal(await cache.read(), null);
            assert.equal(await cache.writeIfNewer({
                resendCooldownSeconds: 600,
                updatedAt: 5,
            }), true);
            assert.deepEqual(await cache.read(), {
                resendCooldownSeconds: 600,
                updatedAt: 5,
            });

            server.seed(CACHE_KEY, JSON.stringify({
                resendCooldownSeconds: 60,
                updatedAt: 6,
                host: 'smtp.example.com',
            }));
            assert.equal(await cache.read(), null);

            server.nextEvalReply = '1';
            await assert.rejects(
                cache.writeIfNewer({ resendCooldownSeconds: 60, updatedAt: 7 }),
                /unexpected reply/,
            );
        });
    });

    test.describe('resend policy reader', () => {
        test('uses a strict cache hit without reading PostgreSQL', async () => {
            const store = configurationStore(configuration({
                resendCooldownSeconds: 600,
                updatedAt: 10,
            }));
            const cache: PlatformEmailResendPolicyCache = {
                async read() {
                    return { resendCooldownSeconds: 30, updatedAt: 11 };
                },
                async writeIfNewer() {
                    throw new Error('refill should not be called');
                },
            };
            const reader = new CachedPlatformEmailResendPolicyReader(store, cache);

            assert.deepEqual(await reader.getPolicy(), {
                resendCooldownSeconds: 30,
                updatedAt: 11,
            });
            assert.equal(store.reads, 0);
        });

        test('falls back to PostgreSQL when Valkey reads and refills fail', async () => {
            const store = configurationStore(configuration({
                resendCooldownSeconds: 600,
                updatedAt: 12,
            }));
            const operations: string[] = [];
            const server = new FakeValkeyPolicyServer();
            server.failReads = true;
            server.failWrites = true;
            const reader = new CachedPlatformEmailResendPolicyReader(
                store,
                new ValkeyPlatformEmailResendPolicyCache(server, { keyPrefix: PREFIX }),
                (operation) => operations.push(operation),
            );

            assert.deepEqual(await reader.getPolicy(), {
                resendCooldownSeconds: 600,
                updatedAt: 12,
            });
            assert.equal(store.reads, 1);
            assert.deepEqual(operations, ['read', 'refill']);
            assert.equal(server.commandSignals.length, 2);
            assert.ok(server.commandSignals.every((signal) => signal instanceof AbortSignal));
        });

        test('aborts stalled Valkey reads and refills', async () => {
            const store = configurationStore(configuration({
                resendCooldownSeconds: 600,
                updatedAt: 14,
            }));
            const operations: string[] = [];
            const signals: AbortSignal[] = [];
            const pending = (signal?: AbortSignal) => {
                assert.ok(signal);
                signals.push(signal);
                return new Promise<never>((_resolve, reject) => {
                    signal.addEventListener(
                        'abort',
                        () => reject(new Error('cache operation aborted')),
                        { once: true },
                    );
                });
            };
            const cache: PlatformEmailResendPolicyCache = {
                read: (signal) => pending(signal),
                writeIfNewer: (_record, signal) => pending(signal),
            };
            const reader = new CachedPlatformEmailResendPolicyReader(
                store,
                cache,
                (operation) => operations.push(operation),
            );

            assert.deepEqual(
                await withBoundedCacheOperation(() => reader.getPolicy(), 1_000),
                { resendCooldownSeconds: 600, updatedAt: 14 },
            );
            assert.equal(store.reads, 1);
            assert.deepEqual(operations, ['read', 'refill']);
            assert.equal(signals.length, 2);
            assert.ok(signals.every((signal) => signal.aborted));
        });

        test('refills a cache miss with the PostgreSQL revision', async () => {
            const store = configurationStore(configuration({
                resendCooldownSeconds: 30,
                updatedAt: 15,
            }));
            const writes: PlatformEmailResendPolicyRecord[] = [];
            const cache: PlatformEmailResendPolicyCache = {
                async read() {
                    return null;
                },
                async writeIfNewer(record) {
                    writes.push(record);
                    return true;
                },
            };
            const reader = new CachedPlatformEmailResendPolicyReader(store, cache);

            assert.deepEqual(await reader.getPolicy(), {
                resendCooldownSeconds: 30,
                updatedAt: 15,
            });
            assert.deepEqual(writes, [{ resendCooldownSeconds: 30, updatedAt: 15 }]);
        });
    });
}

// platform-email-settings-contract.test.ts
{
    const ADMIN_EMAIL_URL = adminApiPath('/platform/email');

    const settings = {
        enabled: false,
        configured: true,
        host: 'smtp.qiye.163.com',
        port: 465,
        security: 'tls' as const,
        usernameMasked: 'ma***@texasoct.tech',
        passwordConfigured: true,
        fromAddress: 'mail@texasoct.tech',
        fromName: 'IMSWeb',
        resendCooldownSeconds: 60,
        updatedAt: 1_000,
    };

    const writeRequest = {
        enabled: true,
        host: settings.host,
        port: settings.port,
        security: settings.security,
        username: 'mail@texasoct.tech',
        password: 'smtp-password',
        fromAddress: settings.fromAddress,
        fromName: settings.fromName,
        resendCooldownSeconds: 30,
        expectedUpdatedAt: settings.updatedAt,
    };

    async function superAdminHeaders(
        fixture: ReturnType<typeof createWikiFixture>,
    ): Promise<Record<string, string>> {
        const csrf = 'email-settings-csrf';
        const token = await fixture.services.backofficeTokens!.sign(
            {
                id: 1,
                username: 'email-settings-super-admin',
                dept: 'op',
                adminRole: 'super_admin',
                csrfSecret: csrf,
            },
            7_200,
        );
        return {
            Cookie: `${BACKOFFICE_ACCESS_TOKEN_COOKIE}=${token}; ${BACKOFFICE_CSRF_TOKEN_COOKIE}=${csrf}`,
            'X-CSRFToken': csrf,
        };
    }

    function configureFixture() {
        const fixture = createWikiFixture();
        const writes: unknown[] = [];
        const tests: unknown[] = [];
        let conflict = false;
        fixture.services.backofficeAuth = {
            async findUserById(id: number) {
                return id === 1
                    ? {
                          id,
                          username: 'email-settings-super-admin',
                          password: 'unused-password-hash',
                          producername: 'Email Settings Super Admin',
                          dept: 'op',
                          admin_role: 'super_admin' as const,
                      }
                    : null;
            },
        } as NonNullable<RuntimeServices['backofficeAuth']>;
        fixture.services.platformEmailConfiguration = {
            async getSettings() {
                return settings;
            },
            async updateSettings(input) {
                writes.push(input);
                return conflict
                    ? { status: 'conflict' as const, settings }
                    : {
                          status: 'saved' as const,
                          settings: {
                              ...settings,
                              enabled: true,
                              resendCooldownSeconds: input.resendCooldownSeconds,
                          },
                      };
            },
            async sendTest(input) {
                tests.push(input);
                return { status: 'sent' as const, recipient: input.recipient };
            },
        };
        return {
            fixture,
            writes,
            tests,
            setConflict(value: boolean) {
                conflict = value;
            },
        };
    }

    test.describe('SMTP administration', () => {
        test('contracts enforce resend cooldown bounds', () => {
            for (const resendCooldownSeconds of [30, 600]) {
                assert.doesNotThrow(() =>
                    adminPlatformEmailConfigurationWriteRequestSchema.parse({
                        ...writeRequest,
                        resendCooldownSeconds,
                    }),
                );
                assert.doesNotThrow(() =>
                    adminPlatformEmailConfigurationTestRequestSchema.parse({
                        ...writeRequest,
                        resendCooldownSeconds,
                        recipient: 'admin@example.com',
                    }),
                );
                assert.doesNotThrow(() =>
                    adminPlatformEmailSettingsSchema.parse({
                        ...settings,
                        resendCooldownSeconds,
                    }),
                );
            }

            for (const resendCooldownSeconds of [29, 30.5, 601]) {
                assert.throws(() =>
                    adminPlatformEmailConfigurationWriteRequestSchema.parse({
                        ...writeRequest,
                        resendCooldownSeconds,
                    }),
                );
                assert.throws(() =>
                    adminPlatformEmailConfigurationTestRequestSchema.parse({
                        ...writeRequest,
                        resendCooldownSeconds,
                        recipient: 'admin@example.com',
                    }),
                );
                assert.throws(() =>
                    adminPlatformEmailSettingsSchema.parse({
                        ...settings,
                        resendCooldownSeconds,
                    }),
                );
            }
        });

        test('mounted SMTP administration enforces super-admin auth and exact contracts', async () => {
            const { fixture, writes, tests } = configureFixture();
            const url = ADMIN_EMAIL_URL;

            const unauthorized = await fixture.app.request(url);
            assert.equal(unauthorized.status, 401);
            await assertRawJsonConforms(unauthorized, adminPlatformEmailHttpErrorSchema);

            const headers = await superAdminHeaders(fixture);
            const listed = await fixture.app.request(url, { headers });
            assert.equal(listed.status, 200, await listed.clone().text());
            const listedBody = await assertRawJsonConforms(
                listed,
                adminPlatformEmailSettingsResponseSchema,
            );
            assert.equal('password' in listedBody.settings, false);
            assert.equal('username' in listedBody.settings, false);

            const parsedWrite = adminPlatformEmailConfigurationWriteRequestSchema.parse(writeRequest);
            const saved = await fixture.app.request(url, {
                method: 'PUT',
                headers: { ...headers, 'content-type': 'application/json' },
                body: JSON.stringify(parsedWrite),
            });
            assert.equal(saved.status, 200, await saved.clone().text());
            await assertRawJsonConforms(saved, adminPlatformEmailMutationResponseSchema);
            assert.deepEqual(writes, [parsedWrite]);

            const testRequest = adminPlatformEmailConfigurationTestRequestSchema.parse({
                ...writeRequest,
                recipient: 'admin@example.com',
            });
            const tested = await fixture.app.request(`${ADMIN_EMAIL_URL}/test`, {
                method: 'POST',
                headers: { ...headers, 'content-type': 'application/json' },
                body: JSON.stringify(testRequest),
            });
            assert.equal(tested.status, 200, await tested.clone().text());
            await assertRawJsonConforms(tested, adminPlatformEmailTestResponseSchema);
            assert.deepEqual(tests, [testRequest]);
        });

        test('returns contract-checked conflicts and strict request errors', async () => {
            const { fixture, setConflict } = configureFixture();
            const headers = await superAdminHeaders(fixture);
            setConflict(true);

            const conflict = await fixture.app.request(ADMIN_EMAIL_URL, {
                method: 'PUT',
                headers: { ...headers, 'content-type': 'application/json' },
                body: JSON.stringify(writeRequest),
            });
            assert.equal(conflict.status, 409, await conflict.clone().text());
            await assertRawJsonConforms(conflict, adminPlatformEmailHttpErrorSchema);

            const invalid = await fixture.app.request(ADMIN_EMAIL_URL, {
                method: 'PUT',
                headers: { ...headers, 'content-type': 'application/json' },
                body: JSON.stringify({ ...writeRequest, legacyMode: 'cloudflare' }),
            });
            assert.equal(invalid.status, 400, await invalid.clone().text());
            await assertRawJsonConforms(invalid, adminPlatformEmailHttpErrorSchema);

            const oversizedPassword = await fixture.app.request(ADMIN_EMAIL_URL, {
                method: 'PUT',
                headers: { ...headers, 'content-type': 'application/json' },
                body: JSON.stringify({ ...writeRequest, password: '密'.repeat(1_500) }),
            });
            assert.equal(oversizedPassword.status, 400, await oversizedPassword.clone().text());
            await assertRawJsonConforms(
                oversizedPassword,
                adminPlatformEmailHttpErrorSchema,
            );
        });
    });
}

// platform-email-settings.test.ts
{
    // This file drives the explicit-close harness adapter instead of `postgresTest`,
    // so it owns the end-of-process allocator cleanup that the Vitest adapter
    // registers for the other PostgreSQL suites.
    afterAll(closeSharedPostgresTestAllocator);

    function record(
        overrides: Partial<PlatformEmailConfigurationRecord> = {},
    ): PlatformEmailConfigurationRecord {
        return {
            enabled: false,
            host: 'smtp.example.com',
            port: 465,
            security: 'tls',
            usernameCiphertext: 'encrypted-user',
            passwordCiphertext: 'encrypted-password',
            fromAddress: 'mail@example.com',
            fromName: 'IMSWeb',
            resendCooldownSeconds: 60,
            updatedAt: 1_000,
            ...overrides,
        };
    }

    function store(initial: PlatformEmailConfigurationRecord) {
        let current = initial;
        let writes = 0;
        const adapter: PlatformEmailConfigurationStore = {
            async getPlatformEmailConfiguration() {
                return current;
            },
            async updatePlatformEmailConfiguration(input) {
                if (input.expectedUpdatedAt !== current.updatedAt) {
                    return { status: 'conflict', configuration: current };
                }
                current = input;
                writes += 1;
                return { status: 'saved', configuration: current };
            },
        };
        return {
            adapter,
            current: () => current,
            writes: () => writes,
        };
    }

    const secretBox = {
        encrypt(value: string) {
            return `encrypted:${value}`;
        },
        decrypt(value: string) {
            if (!value.startsWith('encrypted')) throw new Error('invalid ciphertext');
            return value.startsWith('encrypted:') ? value.slice('encrypted:'.length) :
                value === 'encrypted-user' ? 'mail@example.com' : 'smtp-password';
        },
    };

    function input(overrides: Record<string, unknown> = {}) {
        return {
            enabled: true,
            host: 'smtp.qiye.163.com',
            port: 465,
            security: 'tls' as const,
            username: 'mail@texasoct.tech',
            password: 'smtp-password',
            fromAddress: 'mail@texasoct.tech',
            fromName: 'IMSWeb',
            resendCooldownSeconds: 60,
            expectedUpdatedAt: 1_000,
            ...overrides,
        };
    }

    test.describe('platform email settings', () => {
        test('platform email secret cipher preserves SMTP password bytes', () => {
            const cipher = new PlatformEmailSecretCipher('s'.repeat(32));
            const password = ' password with spaces % ';
            const ciphertext = cipher.encrypt(password);

            assert.notEqual(ciphertext, password);
            assert.equal(cipher.decrypt(ciphertext), password);
            assert.throws(
                () => new PlatformEmailSecretCipher('another-secret-value-that-is-long-enough').decrypt(ciphertext),
            );
        });

        test('enabled SMTP updates verify TLS before the optimistic write', async () => {
            const database = store(record());
            const events: string[] = [];
            let transportConfig: {
                host: string;
                port: number;
                security: string;
                resolvedAddress: string;
            } | undefined;
            const service = new ConfiguredPlatformEmailService(
                database.adapter,
                secretBox,
                (config) => {
                    transportConfig = {
                        host: config.host,
                        port: config.port,
                        security: config.security,
                        resolvedAddress: config.resolvedAddress,
                    };
                    return {
                        async verify() {
                            events.push('verify');
                            return true;
                        },
                        async sendMail() {
                            events.push('send');
                            return {};
                        },
                        close() {
                            events.push('close');
                        },
                    };
                },
                async () => ['93.184.216.34'],
            );

            const result = await service.updateSettings(input());

            assert.equal(result.status, 'saved');
            assert.deepEqual(events, ['verify', 'close']);
            assert.equal(transportConfig?.host, 'smtp.qiye.163.com');
            assert.equal(transportConfig?.port, 465);
            assert.equal(transportConfig?.security, 'tls');
            assert.equal(transportConfig?.resolvedAddress, '93.184.216.34');
            assert.equal(database.current().usernameCiphertext, 'encrypted:mail@texasoct.tech');
            assert.equal(database.current().passwordCiphertext, 'encrypted:smtp-password');
            assert.equal(database.current().resendCooldownSeconds, 60);
            assert.equal(database.writes(), 1);
        });

        test('SMTP settings never expose stored credentials', async () => {
            const database = store(record({ enabled: true }));
            const service = new ConfiguredPlatformEmailService(
                database.adapter,
                secretBox,
                () => {
                    throw new Error('transport should not be created');
                },
            );

            const settings = await service.getSettings();

            assert.equal(settings.usernameMasked, 'ma***@example.com');
            assert.equal(settings.passwordConfigured, true);
            assert.equal(settings.configured, true);
            assert.equal(settings.resendCooldownSeconds, 60);
            assert.equal('password' in settings, false);
            assert.equal('username' in settings, false);
        });

        test('stale SMTP writes return the current settings without opening a connection', async () => {
            const database = store(record({ updatedAt: 2_000 }));
            const policyWrites: unknown[] = [];
            const service = new ConfiguredPlatformEmailService(
                database.adapter,
                secretBox,
                () => {
                    throw new Error('transport should not be created');
                },
                undefined,
                {
                    resendPolicyCache: {
                        async read() {
                            return null;
                        },
                        async writeIfNewer(policy) {
                            policyWrites.push(policy);
                            return true;
                        },
                    },
                },
            );

            const result = await service.updateSettings(input());

            assert.equal(result.status, 'conflict');
            assert.equal(result.settings.updatedAt, 2_000);
            assert.equal(database.writes(), 0);
            assert.deepEqual(policyWrites, []);
        });

        test('SMTP database compare-and-swap conflicts do not write the resend policy cache', async () => {
            const current = record();
            const winning = record({ resendCooldownSeconds: 600, updatedAt: 2_000 });
            const policyWrites: unknown[] = [];
            const configurationStore: PlatformEmailConfigurationStore = {
                async getPlatformEmailConfiguration() {
                    return current;
                },
                async updatePlatformEmailConfiguration() {
                    return { status: 'conflict', configuration: winning };
                },
            };
            const service = new ConfiguredPlatformEmailService(
                configurationStore,
                secretBox,
                () => {
                    throw new Error('transport should not be created');
                },
                undefined,
                {
                    resendPolicyCache: {
                        async read() {
                            return null;
                        },
                        async writeIfNewer(policy) {
                            policyWrites.push(policy);
                            return true;
                        },
                    },
                },
            );

            const result = await service.updateSettings(input({ enabled: false }));

            assert.equal(result.status, 'conflict');
            assert.equal(result.settings.updatedAt, 2_000);
            assert.equal(result.settings.resendCooldownSeconds, 600);
            assert.deepEqual(policyWrites, []);
        });

        test('saved SMTP settings write the returned resend policy revision through cache', async () => {
            const database = store(record());
            const policyWrites: unknown[] = [];
            const service = new ConfiguredPlatformEmailService(
                database.adapter,
                secretBox,
                () => {
                    throw new Error('transport should not be created');
                },
                undefined,
                {
                    resendPolicyCache: {
                        async read() {
                            return null;
                        },
                        async writeIfNewer(policy) {
                            policyWrites.push(policy);
                            return true;
                        },
                    },
                },
            );

            const result = await service.updateSettings(input({
                enabled: false,
                resendCooldownSeconds: 30,
            }));

            assert.equal(result.status, 'saved');
            assert.deepEqual(policyWrites, [{
                resendCooldownSeconds: 30,
                updatedAt: result.settings.updatedAt,
            }]);
        });

        test.describe('SMTP policy cache', () => {
            test('failure does not change a committed settings result', async () => {
                const database = store(record());
                const reported: string[] = [];
                const service = new ConfiguredPlatformEmailService(
                    database.adapter,
                    secretBox,
                    () => {
                        throw new Error('transport should not be created');
                    },
                    undefined,
                    {
                        resendPolicyCache: {
                            async read() {
                                return null;
                            },
                            async writeIfNewer() {
                                throw new Error('cache error with secret-like detail');
                            },
                        },
                        reportResendPolicyCacheError(operation) {
                            reported.push(operation);
                        },
                    },
                );

                const result = await service.updateSettings(input({ enabled: false }));

                assert.equal(result.status, 'saved');
                assert.equal(database.writes(), 1);
                assert.deepEqual(reported, ['write-through']);
            });

            test('timeout does not delay a committed settings result indefinitely', async () => {
                const database = store(record());
                const reported: string[] = [];
                let aborted = false;
                const service = new ConfiguredPlatformEmailService(
                    database.adapter,
                    secretBox,
                    () => {
                        throw new Error('transport should not be created');
                    },
                    undefined,
                    {
                        resendPolicyCache: {
                            async read() {
                                return null;
                            },
                            writeIfNewer(_record, signal) {
                                return new Promise<never>((_resolve, reject) => {
                                    signal?.addEventListener(
                                        'abort',
                                        () => {
                                            aborted = true;
                                            reject(new Error('cache operation aborted'));
                                        },
                                        { once: true },
                                    );
                                });
                            },
                        },
                        reportResendPolicyCacheError(operation) {
                            reported.push(operation);
                        },
                    },
                );

                const result = await withBoundedCacheOperation(
                    () => service.updateSettings(input({ enabled: false })),
                    1_000,
                );

                assert.equal(result.status, 'saved');
                assert.equal(database.writes(), 1);
                assert.deepEqual(reported, ['write-through']);
                assert.equal(aborted, true);
            });
        });

        test.describe('SMTP resend cooldown', () => {
            test('accepts boundaries and retains stored credentials', async () => {
                for (const resendCooldownSeconds of [30, 600]) {
                    const database = store(record());
                    const service = new ConfiguredPlatformEmailService(
                        database.adapter,
                        secretBox,
                        () => {
                            throw new Error('transport should not be created');
                        },
                    );

                    const result = await service.updateSettings(input({
                        enabled: false,
                        username: undefined,
                        password: undefined,
                        resendCooldownSeconds,
                    }));

                    assert.equal(result.status, 'saved');
                    assert.equal(database.current().resendCooldownSeconds, resendCooldownSeconds);
                    assert.equal(database.current().usernameCiphertext, 'encrypted-user');
                    assert.equal(database.current().passwordCiphertext, 'encrypted-password');
                    assert.equal(database.writes(), 1);
                }
            });

            test('rejects out-of-range and non-integer values', async () => {
                for (const resendCooldownSeconds of [29, 30.5, 601]) {
                    const database = store(record());
                    const service = new ConfiguredPlatformEmailService(
                        database.adapter,
                        secretBox,
                        () => {
                            throw new Error('transport should not be created');
                        },
                    );

                    await assert.rejects(
                        () => service.updateSettings(input({
                            enabled: false,
                            resendCooldownSeconds,
                        })),
                        /resend cooldown must be an integer from 30 to 600 seconds/,
                    );
                    assert.equal(database.writes(), 0);
                }
            });
        });

        test('SMTP test send uses the complete draft without persisting it', async () => {
            const database = store(record());
            const events: string[] = [];
            const service = new ConfiguredPlatformEmailService(
                database.adapter,
                secretBox,
                () => ({
                    async verify() {
                        events.push('verify');
                        return true;
                    },
                    async sendMail(message) {
                        events.push(`send:${message.to}`);
                        return {};
                    },
                    close() {
                        events.push('close');
                    },
                }),
                async () => ['93.184.216.34'],
            );

            const result = await service.sendTest({
                ...input({ resendCooldownSeconds: 30 }),
                recipient: 'ADMIN@example.com',
            });

            assert.deepEqual(result, { status: 'sent', recipient: 'admin@example.com' });
            assert.deepEqual(events, ['verify', 'send:admin@example.com', 'close']);
            assert.equal(database.current().resendCooldownSeconds, 60);
            assert.equal(database.writes(), 0);
        });

        test('worker SMTP delivery reads the active database configuration for every message', async () => {
            const database = store(record({ enabled: true }));
            const recipients: string[] = [];
            const service = new ConfiguredPlatformEmailService(
                database.adapter,
                secretBox,
                () => ({
                    async verify() {
                        return true;
                    },
                    async sendMail(message) {
                        recipients.push(message.to);
                        return { accepted: [message.to] };
                    },
                    close() {},
                }),
                async () => ['93.184.216.34'],
            );

            const result = await service.deliverVerification({
                purpose: 'registration',
                message: {
                    email: 'producer@example.com',
                    code: '123456',
                    expiresInMinutes: 10,
                },
                deadlineAt: Date.now() + 1_000,
                signal: new AbortController().signal,
            });

            assert.equal(result.status, 'accepted');
            assert.deepEqual(recipients, ['producer@example.com']);
        });

        test('SMTP connections reject non-public and mixed DNS results', async () => {
            const addressSets = [
                ['127.0.0.1'],
                ['192.0.2.1'],
                ['198.51.100.1'],
                ['203.0.113.1'],
                ['2001:db8::1'],
                ['93.184.216.34', '10.0.0.1'],
            ];

            for (const addresses of addressSets) {
                const database = store(record());
                let transportCreated = false;
                const service = new ConfiguredPlatformEmailService(
                    database.adapter,
                    secretBox,
                    () => {
                        transportCreated = true;
                        throw new Error('transport should not be created');
                    },
                    async () => addresses,
                );

                await assert.rejects(
                    () => service.updateSettings(input()),
                    /resolve only to public addresses/,
                );
                assert.equal(transportCreated, false);
                assert.equal(database.writes(), 0);
            }
        });

        test(
            'real PostgreSQL stores one SMTP configuration with optimistic concurrency',
            { skip: !postgresIntegrationEnabled() },
            async () => {
                const harness = await createPostgresTestHarness();
                onTestFinished(() => harness.close());
                const repository = new SqlPlatformEmailConfigurationRepository(
                    harness.connection,
                );
                const initial = await repository.getPlatformEmailConfiguration();
                assert.equal(initial.enabled, false);
                assert.equal(initial.resendCooldownSeconds, 60);
                assert.equal(initial.updatedAt, 0);

                const saved = await repository.updatePlatformEmailConfiguration({
                    ...record({
                        enabled: true,
                        host: 'smtp.qiye.163.com',
                        usernameCiphertext: 'ciphertext-user',
                        passwordCiphertext: 'ciphertext-password',
                        fromAddress: 'mail@texasoct.tech',
                        resendCooldownSeconds: 30,
                        updatedAt: 1,
                    }),
                    expectedUpdatedAt: 0,
                });
                assert.equal(saved.status, 'saved');
                assert.equal(saved.configuration.host, 'smtp.qiye.163.com');
                assert.equal(saved.configuration.resendCooldownSeconds, 30);
                assert.equal(
                    (await repository.getPlatformEmailConfiguration()).resendCooldownSeconds,
                    30,
                );

                const conflict = await repository.updatePlatformEmailConfiguration({
                    ...saved.configuration,
                    enabled: false,
                    updatedAt: 2,
                    expectedUpdatedAt: 0,
                });
                assert.equal(conflict.status, 'conflict');
                assert.equal(conflict.configuration.enabled, true);
                assert.equal(conflict.configuration.resendCooldownSeconds, 30);
                assert.equal(conflict.configuration.updatedAt, 1);
            },
        );
    });
}
