import assert from "node:assert/strict";
import { readContractJson as assertRawJsonConforms } from "../contracts/contract-json";
import {
    bearerTokenHeaders,
    setCookieHeaders as setCookies,
} from "../fixtures/auth-request";
import { createHash, pbkdf2Sync, randomUUID } from "node:crypto";
import { test as nodeTest, type TestContext } from "node:test";
import { postgresTest as test } from '../integration/postgres-harness';
import { successFlagSchema } from "@imsweb/contracts/common";
import {
    passwordResetIssueResponseSchema,
    platformHttpErrorSchema,
    platformRegistrationVerificationResponseSchema,
    platformSessionSchema,
} from "@imsweb/contracts/platform";
import { createHonoApp } from "@/app";
import { SqlPlatformAccountRepository } from "@/infra/db/repositories/platform-account-repository";
import { SqlPlatformEmailDeliveryRepository } from "@/infra/db/repositories/platform-email-delivery-repository";
import { PlatformEmailJobPayloadCipherAdapter } from "@/infra/email/smtp/platform-email-job-payload";
import type {
    ManagedSqlDatabase,
    SqlSchemaStrategy,
} from "@/infra/db/sql/database";
import { MemoryCache } from "@/infra/cache/memory/cache";
import { BcryptPasswordVerifier } from "@/infra/security/bcrypt/password-verifier";
import { HmacPlatformTokenService } from "@/infra/security/hmac/platform-token-service";
import { NodeEmailDeliveryRunner } from '@/runtime/node-email-delivery-runner';
import { platformEmailVerificationCacheKey } from "@/domains/identity/platform-auth/registration/email-verification-cache";
import {
    platformPasswordResetCacheKey,
    platformPasswordResetRecipientKey,
} from "@/domains/identity/platform-auth/password-reset/password-reset-cache";
import { isMigratedPbkdf2Parameters } from "@/domains/identity/platform-auth/contracts/credentials";
import type {
    NewPlatformEmailAccountInput,
    PlatformAccountStatus,
} from "@/ports/repositories";
import type {
    PlatformEmailDeliveryPurpose,
    PlatformEmailJobPayloadCipher,
} from "@/ports/email-delivery";
import type { CacheStore } from "@/ports/cache";
import type { RuntimeServices } from "@/ports/runtime-services";
import {
    createPostgresTestHarness,
    postgresIntegrationEnabled,
} from "../integration/postgres-harness";

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
    app: ReturnType<typeof createHonoApp>;
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
): ReturnType<typeof createHonoApp> {
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
    return createHonoApp(() => runtime);
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

async function createFixture(t: TestContext): Promise<Fixture> {
    const harness = await createPostgresTestHarness();
    t.after(() => harness.close());
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
    t: TestContext,
    dialect: "postgresql",
): Promise<void> {
    const fixture = await createFixture(t);
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
    t.after(() => siblingRepository.close().catch(() => undefined));
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

async function assertRegistrationAndLogin(t: TestContext): Promise<void> {
    const fixture = await createFixture(t);
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

test("bearer callers get tokens from registration and login, cookie callers do not", async (t) => {
    const fixture = await createFixture(t);
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
    const session = await fixture.app.request(
        "http://ims.test/api/platform/auth/session",
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

test("password reset responses preserve exact JSON and reject invalid API email grammar", async (t) => {
    const fixture = await createFixture(t);
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

test("registration verification is hashed, cached, atomically consumed, and single use", async (t) => {
    const fixture = await createFixture(t);
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

test("verification requests enqueue without SMTP and staged codes remain unusable", async (t) => {
    const fixture = await createFixture(t);
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

test('durable HTTP enqueue is completed by a fresh worker runner', async (t) => {
    const fixture = await createFixture(t);
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
    t.after(async () => {
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

test("configured resend intervals and unknown password reset responses come from PostgreSQL", async (t) => {
    const fixture = await createFixture(t);
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

test("password reset cooldown is enumeration-safe with missing or failing cache", async (t) => {
    const fixture = await createFixture(t);
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

test("cache failure falls through to SQL cooldown with exact Retry-After", async (t) => {
    const fixture = await createFixture(t);
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

test("verification enqueue failure returns purpose-specific unavailable response", async (t) => {
    const fixture = await createFixture(t);
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

test("session fencing returns account unavailable without writing cookies", async (t) => {
    const fixture = await createFixture(t);
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

test("login returns one generic credential error and rejects blocked account states", async (t) => {
    const { app, repository } = await createFixture(t);
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

test("migrated PBKDF2 credential logs in once and upgrades with bcrypt CAS", async (t) => {
    const { app, database, repository } = await createFixture(t);
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

test("long migrated PBKDF2 passwords authenticate without unsafe bcrypt upgrade", async (t) => {
    const { app, database, repository } = await createFixture(t);
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

test("bcrypt rejects passwords beyond 72 UTF-8 bytes instead of truncating", async (t) => {
    const fixture = await createFixture(t);
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

test("email auth strictly validates JSON shapes and credential fields", async (t) => {
    const { app } = await createFixture(t);
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
    const invalidJson = await app.request(
        "http://ims.test/api/platform/auth/login",
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
    const missingJsonType = await app.request(
        "http://ims.test/api/platform/auth/register",
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
    const app = createHonoApp(() => ({
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
    const app = createHonoApp(
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

test("real PostgreSQL keeps registration atomic under normalized email races", {
    skip:
        !postgresIntegrationEnabled() &&
        "set IMS_TEST_POSTGRES_ADMIN_URL to a local PostgreSQL admin database",
}, async (t) => {
    await assertRegistrationAndLogin(t);

    const fixture = await createFixture(t);
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

test("real PostgreSQL failed resend preserves old code across repository instances", {
    skip:
        !postgresIntegrationEnabled() &&
        "set IMS_TEST_POSTGRES_ADMIN_URL to a local PostgreSQL admin database",
}, async (t) => {
    await assertFailedResendPreservesOldCode(t, "postgresql");
});
