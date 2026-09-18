import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { TestContext } from 'node:test';
import { postgresTest as test } from '../integration/postgres-harness';
import { createPostgresTestHarness, type PostgresTestHarness } from '../integration/postgres-harness';
import { SqlPlatformAccountRepository } from '@/infra/db/repositories/platform-account-repository';
import type { SqlSchemaStrategy } from '@/infra/db/sql/database';
import type {
    CreatePlatformEmailCredentialInput,
    CreatePlatformOAuthIdentityForAccountInput,
    ForceLogoutPlatformAccountInput,
    NewPlatformEmailAccountInput,
    NewPlatformOAuthAccountInput,
    PlatformSecurityEventInput,
    SetPlatformAccountStatusInput
} from '@/ports/repositories';
import type { PlatformOAuthProviderCode } from '@/ports/oauth';

/**
 * Wave 0.5 froze the account-management repository primitives. The interface
 * contract suite only proves the shapes a stub returns, so the SQL predicates
 * that carry the safety rules (last-credential fences, unique-constraint
 * classification, `DELETE ... RETURNING` consumption) have no coverage there.
 * These cases run the real statements against real PostgreSQL, including the
 * concurrent ones, because that is where those rules actually live.
 */

const AT = 1_775_100_000_000;
const initializedPostgresSchema: SqlSchemaStrategy = {
    initializeCore: async () => undefined,
    initializePlatform: async () => undefined,
    initializeFudaba: async () => undefined,
    initializeStory: async () => undefined
};

function sha(value: string): string {
    return createHash('sha256').update(value).digest('hex');
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
    providerCode: PlatformOAuthProviderCode = 'google',
    subject = `${providerCode}-${id}`
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
            providerSubject: subject,
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

function event(accountId: string, eventType: PlatformSecurityEventInput['eventType'] = 'auth.oauth.linked'): PlatformSecurityEventInput {
    return {
        id: `event-${accountId}-${Math.random().toString(36).slice(2)}`,
        accountId,
        eventType,
        requestId: null,
        ipAddress: null,
        userAgent: null,
        metadataJson: '{}',
        createdAt: AT
    };
}

function credentialInput(normalizedEmail: string): CreatePlatformEmailCredentialInput {
    return {
        normalizedEmail,
        algorithm: 'bcrypt',
        parametersJson: JSON.stringify({ cost: 12 }),
        passwordHash: 'hash-bound',
        createdAt: AT,
        updatedAt: AT
    };
}

function linkInput(
    accountId: string,
    providerCode: PlatformOAuthProviderCode,
    subject: string
): CreatePlatformOAuthIdentityForAccountInput {
    return {
        accountId,
        providerCode,
        providerSubject: subject,
        providerDisplayName: 'Linked Name',
        providerAvatarUrl: '',
        createdAt: AT,
        updatedAt: AT,
        event: event(accountId)
    };
}

interface Fixture {
    harness: PostgresTestHarness;
    platform: SqlPlatformAccountRepository;
    second: SqlPlatformAccountRepository;
}

async function createFixture(t: TestContext): Promise<Fixture> {
    const harness = await createPostgresTestHarness();
    t.after(() => harness.close());
    const platform = new SqlPlatformAccountRepository(
        harness.connection,
        initializedPostgresSchema
    );
    await platform.initialize();
    // A second repository instance is a second `serializeWrite` queue over a
    // second connection, which is what makes the concurrent cases real rather
    // than a serialized illusion.
    const second = new SqlPlatformAccountRepository(
        harness.connect(),
        initializedPostgresSchema
    );
    return { harness, platform, second };
}

async function insertVerificationCode(
    harness: PostgresTestHarness,
    codeHash: string,
    email: string
): Promise<void> {
    await harness.connection
        .prepare(
            `INSERT INTO platform_email_verification_codes
                (normalized_email, code_hash, expires_at, resend_after,
                 attempts_remaining, consumed_token, created_at, updated_at)
             VALUES (?, ?, ?, ?, 5, NULL, ?, ?)`
        )
        .bind(email, codeHash, AT + 600_000, AT, AT, AT)
        .run();
}

async function verificationCodeRow(
    harness: PostgresTestHarness,
    email: string
): Promise<{ code_hash: string; consumed_token: string | null } | null> {
    return harness.connection
        .prepare(
            `SELECT code_hash, consumed_token
             FROM platform_email_verification_codes WHERE normalized_email=?`
        )
        .bind(email)
        .first<{ code_hash: string; consumed_token: string | null }>();
}

async function insertRefreshSession(
    harness: PostgresTestHarness,
    input: {
        id: string;
        accountId: string;
        createdAt?: number;
        expiresAt?: number;
        lastSeenAt?: number | null;
    }
): Promise<void> {
    await harness.connection
        .prepare(
            `INSERT INTO platform_refresh_sessions
                (id, account_id, token_hash, previous_token_hash, csrf_hash,
                 expires_at, created_at, updated_at, revoked_at, user_agent,
                 ip_address, last_seen_at)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, NULL, ?)`
        )
        .bind(
            input.id,
            input.accountId,
            sha(`token-${input.id}`),
            sha(`csrf-${input.id}`),
            input.expiresAt ?? AT + 3_600_000,
            input.createdAt ?? AT,
            input.createdAt ?? AT,
            input.lastSeenAt ?? null
        )
        .run();
}

async function accountStatus(
    fixture: Fixture,
    accountId: string
): Promise<{ status: string; token_version: number } | null> {
    return fixture.harness.connection
        .prepare('SELECT status, token_version FROM platform_accounts WHERE id=?')
        .bind(accountId)
        .first<{ status: string; token_version: number }>();
}

async function liveSessionCount(
    fixture: Fixture,
    accountId: string
): Promise<number> {
    const row = await fixture.harness.connection
        .prepare(
            `SELECT COUNT(*) AS total FROM platform_refresh_sessions
             WHERE account_id=? AND revoked_at IS NULL AND expires_at>?`
        )
        .bind(accountId, AT)
        .first<{ total: number | string }>();
    return Number(row?.total ?? 0);
}

// ── OAuth identity binding ────────────────────────────────────────────────

test('linking an identity writes the row and its audit event', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'link-created';
    await fixture.platform.createOAuthAccount(oauthAccount(accountId));

    const result = await fixture.platform.createOAuthIdentityForAccount(
        linkInput(accountId, 'github', 'github-subject-1')
    );

    assert.equal(result.status, 'created');
    const events = await fixture.harness.connection
        .prepare(
            `SELECT event_type FROM platform_security_events
             WHERE account_id=? AND event_type='auth.oauth.linked'`
        )
        .bind(accountId)
        .all<{ event_type: string }>();
    assert.equal(events.results.length, 1);
});

test('re-linking the same subject to the same account is idempotent', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'link-idempotent';
    await fixture.platform.createOAuthAccount(oauthAccount(accountId));
    await fixture.platform.createOAuthIdentityForAccount(
        linkInput(accountId, 'github', 'github-subject-2')
    );

    const second = await fixture.platform.createOAuthIdentityForAccount(
        linkInput(accountId, 'github', 'github-subject-2')
    );

    assert.equal(second.status, 'already-linked');
    const events = await fixture.harness.connection
        .prepare(
            `SELECT COUNT(*) AS total FROM platform_security_events
             WHERE account_id=? AND event_type='auth.oauth.linked'`
        )
        .bind(accountId)
        .first<{ total: number | string }>();
    assert.equal(Number(events?.total ?? 0), 1);
});

test('a subject owned by another account is refused without a write', async (t) => {
    const fixture = await createFixture(t);
    const owner = 'link-owner';
    const stranger = 'link-stranger';
    await fixture.platform.createOAuthAccount(oauthAccount(owner, 'google', 'shared-subject'));
    await fixture.platform.createOAuthAccount(oauthAccount(stranger));

    const result = await fixture.platform.createOAuthIdentityForAccount(
        linkInput(stranger, 'google', 'shared-subject')
    );

    assert.equal(result.status, 'identity-conflict');
    const rows = await fixture.harness.connection
        .prepare(
            `SELECT account_id FROM platform_oauth_identities
             WHERE provider_code='google' AND provider_subject='shared-subject'`
        )
        .all<{ account_id: string }>();
    assert.deepEqual(rows.results.map((row) => row.account_id), [owner]);
});

test('a second subject for the same provider on one account is a provider conflict', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'link-provider-conflict';
    await fixture.platform.createOAuthAccount(oauthAccount(accountId, 'google', 'first-subject'));

    const result = await fixture.platform.createOAuthIdentityForAccount(
        linkInput(accountId, 'google', 'second-subject')
    );

    assert.equal(result.status, 'provider-conflict');
});

test('linking to a missing or inactive account is not found', async (t) => {
    const fixture = await createFixture(t);

    const result = await fixture.platform.createOAuthIdentityForAccount(
        linkInput('missing-account', 'github', 'gh-subject')
    );

    assert.equal(result.status, 'not-found');
});

test('two concurrent links of one subject resolve to exactly one owner', async (t) => {
    const fixture = await createFixture(t);
    await fixture.platform.createOAuthAccount(oauthAccount('race-a'));
    await fixture.platform.createOAuthAccount(oauthAccount('race-b'));

    const [left, right] = await Promise.all([
        fixture.platform.createOAuthIdentityForAccount(
            linkInput('race-a', 'github', 'raced-subject')
        ),
        fixture.second.createOAuthIdentityForAccount(
            linkInput('race-b', 'github', 'raced-subject')
        )
    ]);

    const statuses = [left.status, right.status].sort();
    assert.deepEqual(statuses, ['created', 'identity-conflict']);
    const rows = await fixture.harness.connection
        .prepare(
            `SELECT account_id FROM platform_oauth_identities
             WHERE provider_code='github' AND provider_subject='raced-subject'`
        )
        .all<{ account_id: string }>();
    assert.equal(rows.results.length, 1);
});

test('two unlinks cannot strip every login method', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'unlink-race';
    await fixture.platform.createOAuthAccount(
        oauthAccount(accountId, 'google', 'unlink-google')
    );
    await fixture.platform.createOAuthIdentityForAccount(
        linkInput(accountId, 'github', 'unlink-github')
    );

    const [left, right] = await Promise.all([
        fixture.platform.deleteOAuthIdentity({
            accountId,
            providerCode: 'google',
            event: event(accountId, 'auth.oauth.unlinked')
        }),
        fixture.platform.deleteOAuthIdentity({
            accountId,
            providerCode: 'github',
            event: event(accountId, 'auth.oauth.unlinked')
        })
    ]);

    assert.deepEqual(
        [left.status, right.status].sort(),
        ['deleted', 'last-login-method']
    );
    const remaining = await fixture.harness.connection
        .prepare(
            'SELECT provider_code FROM platform_oauth_identities WHERE account_id=?'
        )
        .bind(accountId)
        .all<{ provider_code: string }>();
    assert.equal(remaining.results.length, 1);
});

// ── Email credential binding / migration ──────────────────────────────────

test('binding an email credential consumes the code and survives a password hash', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'email-bind';
    await fixture.platform.createOAuthAccount(oauthAccount(accountId));
    const email = 'bind-new@ims.test';
    await insertVerificationCode(fixture.harness, sha('code'), email);

    const result = await fixture.platform.createVerifiedEmailCredentialForAccount({
        accountId,
        credential: credentialInput(email),
        verification: { codeHash: sha('code'), consumedToken: sha('token'), verifiedAt: AT },
        event: event(accountId, 'auth.email.bound')
    });

    assert.equal(result.status, 'created');
    assert.equal(result.credential.password_hash, 'hash-bound');
    assert.equal(await verificationCodeRow(fixture.harness, email), null);
});

test('binding a second credential for one account is already-bound and keeps the code', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'email-bind-twice';
    await fixture.platform.createEmailAccount(emailAccount(accountId));
    const email = 'bind-second@ims.test';
    await insertVerificationCode(fixture.harness, sha('code-2'), email);

    const result = await fixture.platform.createVerifiedEmailCredentialForAccount({
        accountId,
        credential: credentialInput(email),
        verification: { codeHash: sha('code-2'), consumedToken: sha('token-2'), verifiedAt: AT },
        event: event(accountId, 'auth.email.bound')
    });

    assert.equal(result.status, 'already-bound');
    const code = await verificationCodeRow(fixture.harness, email);
    assert.ok(code);
    assert.equal(code.consumed_token, null);
});

test('binding a taken address reports email-conflict and rolls the code back', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'email-bind-conflict';
    await fixture.platform.createOAuthAccount(oauthAccount(accountId));
    const email = 'taken@ims.test';
    await fixture.platform.createEmailAccount({
        ...emailAccount('taken-owner'),
        credential: { ...emailAccount('taken-owner').credential, normalizedEmail: email }
    });
    await insertVerificationCode(fixture.harness, sha('conflict-code'), email);

    const result = await fixture.platform.createVerifiedEmailCredentialForAccount({
        accountId,
        credential: credentialInput(email),
        verification: {
            codeHash: sha('conflict-code'),
            consumedToken: sha('conflict-token'),
            verifiedAt: AT
        },
        event: event(accountId, 'auth.email.bound')
    });

    assert.equal(result.status, 'email-conflict');
    const code = await verificationCodeRow(fixture.harness, email);
    assert.ok(code);
    assert.equal(code.consumed_token, null);
});

test('a wrong binding code leaves the credential unwritten', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'email-bind-invalid';
    await fixture.platform.createOAuthAccount(oauthAccount(accountId));
    const email = 'invalid@ims.test';
    await insertVerificationCode(fixture.harness, sha('the-real-code'), email);

    const result = await fixture.platform.createVerifiedEmailCredentialForAccount({
        accountId,
        credential: credentialInput(email),
        verification: {
            codeHash: sha('a-different-code'),
            consumedToken: sha('token'),
            verifiedAt: AT
        },
        event: event(accountId, 'auth.email.bound')
    });

    assert.equal(result.status, 'verification-invalid');
    assert.equal(
        await fixture.platform.findEmailCredentialByAccountId(accountId),
        null
    );
});

test('migrating an email keeps the password hash, algorithm and salt', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'email-migrate';
    await fixture.platform.createEmailAccount(emailAccount(accountId));
    const before = await fixture.platform.findEmailCredentialByAccountId(accountId);
    assert.ok(before);
    const nextEmail = 'migrated@ims.test';
    await insertVerificationCode(fixture.harness, sha('migrate-code'), nextEmail);

    const result = await fixture.platform.migrateEmailCredentialForAccount({
        accountId,
        currentNormalizedEmail: before.normalized_email,
        newNormalizedEmail: nextEmail,
        expectedPasswordHash: before.password_hash,
        expectedUpdatedAt: before.updated_at,
        updatedAt: AT + 1_000,
        verification: {
            codeHash: sha('migrate-code'),
            consumedToken: sha('migrate-token'),
            verifiedAt: AT + 1_000
        },
        event: event(accountId, 'auth.email.changed')
    });

    assert.equal(result.status, 'migrated');
    assert.equal(result.credential.normalized_email, nextEmail);
    assert.equal(result.credential.password_hash, before.password_hash);
    assert.equal(result.credential.algorithm, before.algorithm);
    assert.equal(result.credential.salt, before.salt);
    assert.equal(result.credential.created_at, before.created_at);
    assert.equal(await verificationCodeRow(fixture.harness, nextEmail), null);
});

test('a stale migration expectation reports state-conflict', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'email-migrate-conflict';
    await fixture.platform.createEmailAccount(emailAccount(accountId));
    const before = await fixture.platform.findEmailCredentialByAccountId(accountId);
    assert.ok(before);

    const result = await fixture.platform.migrateEmailCredentialForAccount({
        accountId,
        currentNormalizedEmail: before.normalized_email,
        newNormalizedEmail: 'never@ims.test',
        expectedPasswordHash: 'not-the-hash',
        expectedUpdatedAt: before.updated_at,
        updatedAt: AT + 1_000,
        verification: {
            codeHash: sha('unused'),
            consumedToken: sha('unused-token'),
            verifiedAt: AT + 1_000
        },
        event: event(accountId, 'auth.email.changed')
    });

    assert.equal(result.status, 'state-conflict');
});

test('migrating without a bound credential reports not-bound', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'email-migrate-none';
    await fixture.platform.createOAuthAccount(oauthAccount(accountId));

    const result = await fixture.platform.migrateEmailCredentialForAccount({
        accountId,
        currentNormalizedEmail: 'none@ims.test',
        newNormalizedEmail: 'next@ims.test',
        expectedPasswordHash: 'h',
        expectedUpdatedAt: AT,
        updatedAt: AT + 1_000,
        verification: {
            codeHash: sha('x'),
            consumedToken: sha('y'),
            verifiedAt: AT + 1_000
        },
        event: event(accountId, 'auth.email.changed')
    });

    assert.equal(result.status, 'not-bound');
});

test('two concurrent binds for one account produce exactly one credential', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'email-bind-race';
    await fixture.platform.createOAuthAccount(oauthAccount(accountId));
    const first = 'race-one@ims.test';
    const second = 'race-two@ims.test';
    await insertVerificationCode(fixture.harness, sha('race-code-one'), first);
    await insertVerificationCode(fixture.harness, sha('race-code-two'), second);

    const results = await Promise.all([
        fixture.platform.createVerifiedEmailCredentialForAccount({
            accountId,
            credential: credentialInput(first),
            verification: {
                codeHash: sha('race-code-one'),
                consumedToken: sha('race-token-one'),
                verifiedAt: AT
            },
            event: event(accountId, 'auth.email.bound')
        }),
        fixture.second.createVerifiedEmailCredentialForAccount({
            accountId,
            credential: credentialInput(second),
            verification: {
                codeHash: sha('race-code-two'),
                consumedToken: sha('race-token-two'),
                verifiedAt: AT
            },
            event: event(accountId, 'auth.email.bound')
        })
    ]);

    const statuses = results.map((result) => result.status).sort();
    assert.deepEqual(statuses, ['already-bound', 'created']);
    const rows = await fixture.harness.connection
        .prepare(
            `SELECT normalized_email FROM platform_email_credentials
             WHERE account_id=?`
        )
        .bind(accountId)
        .all<{ normalized_email: string }>();
    assert.equal(rows.results.length, 1);
});

// ── OAuth state for link / app ────────────────────────────────────────────

test('a link state round-trips its account and intent', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'state-link';
    await fixture.platform.createOAuthAccount(oauthAccount(accountId));

    await fixture.platform.createOAuthState({
        stateHash: sha('state-link'),
        providerCode: 'google',
        intent: 'link',
        linkingAccountId: accountId,
        clientTarget: 'web',
        appCodeChallenge: null,
        codeVerifier: 'v'.repeat(43),
        returnPath: '/account/security',
        expiresAt: AT + 600_000,
        createdAt: AT
    });

    const consumed = await fixture.platform.consumeOAuthState(
        sha('state-link'),
        'google',
        AT
    );
    assert.equal(consumed?.intent, 'link');
    assert.equal(consumed?.linking_account_id, accountId);
    assert.equal(consumed?.client_target, 'web');
});

test('an app state carries its challenge and survives the read-only target lookup', async (t) => {
    const fixture = await createFixture(t);
    const challenge = 'c'.repeat(43);
    await fixture.platform.createOAuthState({
        stateHash: sha('state-app'),
        providerCode: 'google',
        intent: 'login',
        linkingAccountId: null,
        clientTarget: 'app',
        appCodeChallenge: challenge,
        codeVerifier: 'v'.repeat(43),
        returnPath: '/account/me',
        expiresAt: AT + 600_000,
        createdAt: AT
    });

    assert.equal(
        await fixture.platform.findOAuthStateClientTarget(sha('state-app'), 'google', AT),
        'app'
    );
    // The lookup must not consume the row; the callback still has to redeem it.
    const consumed = await fixture.platform.consumeOAuthState(sha('state-app'), 'google', AT);
    assert.equal(consumed?.app_code_challenge, challenge);
});

// ── One-time exchange codes ───────────────────────────────────────────────

test('an exchange code is consumed exactly once', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'exchange-single';
    await fixture.platform.createOAuthAccount(oauthAccount(accountId));

    await fixture.platform.createOAuthExchangeCode({
        codeHash: sha('exchange-code'),
        accountId,
        codeChallenge: 'c'.repeat(43),
        expiresAt: AT + 300_000,
        createdAt: AT
    });

    const first = await fixture.platform.consumeOAuthExchangeCode(sha('exchange-code'), AT);
    assert.equal(first?.account_id, accountId);
    assert.equal(first?.code_challenge, 'c'.repeat(43));
    assert.equal(
        await fixture.platform.consumeOAuthExchangeCode(sha('exchange-code'), AT),
        null
    );
});

test('an expired exchange code is not returned', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'exchange-expired';
    await fixture.platform.createOAuthAccount(oauthAccount(accountId));
    await fixture.platform.createOAuthExchangeCode({
        codeHash: sha('exchange-expired-code'),
        accountId,
        codeChallenge: 'c'.repeat(43),
        expiresAt: AT + 1,
        createdAt: AT
    });

    assert.equal(
        await fixture.platform.consumeOAuthExchangeCode(sha('exchange-expired-code'), AT + 2),
        null
    );
});

test('a concurrent exchange redeems the code for exactly one caller', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'exchange-race';
    await fixture.platform.createOAuthAccount(oauthAccount(accountId));
    await fixture.platform.createOAuthExchangeCode({
        codeHash: sha('exchange-race-code'),
        accountId,
        codeChallenge: 'c'.repeat(43),
        expiresAt: AT + 300_000,
        createdAt: AT
    });

    const [left, right] = await Promise.all([
        fixture.platform.consumeOAuthExchangeCode(sha('exchange-race-code'), AT),
        fixture.second.consumeOAuthExchangeCode(sha('exchange-race-code'), AT)
    ]);

    assert.equal([left, right].filter(Boolean).length, 1);
});

// ── Admin platform-user management ────────────────────────────────────────

test('admin listing searches by id, email and display name and excludes deleted accounts', async (t) => {
    const fixture = await createFixture(t);
    await fixture.platform.createEmailAccount({
        ...emailAccount('admin-email'),
        profile: { ...profile('admin-email'), displayName: 'Ada Admin' }
    });
    await fixture.platform.createOAuthAccount({
        ...oauthAccount('admin-oauth'),
        profile: { ...profile('admin-oauth'), displayName: 'Bob Builder' }
    });
    await fixture.platform.createEmailAccount(emailAccount('admin-deleted'));
    await fixture.harness.connection
        .prepare(
            `UPDATE platform_accounts SET status='deleted', deleted_at=?, updated_at=?
             WHERE id='admin-deleted'`
        )
        .bind(AT, AT)
        .run();
    await insertRefreshSession(fixture.harness, {
        id: 'admin-session',
        accountId: 'admin-email',
        lastSeenAt: AT + 500
    });

    const all = await fixture.platform.listPlatformAccountsForAdmin({
        field: 'id',
        query: null,
        limit: 50,
        offset: 0,
        activeAt: AT
    });
    assert.deepEqual(
        all.map((record) => record.id).sort(),
        ['admin-email', 'admin-oauth']
    );
    const emailRow = all.find((record) => record.id === 'admin-email');
    assert.equal(emailRow?.has_password, true);
    assert.equal(emailRow?.normalized_email, 'admin-email@ims.test');
    assert.equal(emailRow?.active_session_count, 1);
    assert.equal(emailRow?.last_login_at, AT + 500);
    const oauthRow = all.find((record) => record.id === 'admin-oauth');
    assert.equal(oauthRow?.has_password, false);
    assert.equal(oauthRow?.normalized_email, null);

    const byId = await fixture.platform.listPlatformAccountsForAdmin({
        field: 'id',
        query: 'admin-oauth',
        limit: 50,
        offset: 0,
        activeAt: AT
    });
    assert.deepEqual(byId.map((record) => record.id), ['admin-oauth']);

    const byEmail = await fixture.platform.listPlatformAccountsForAdmin({
        field: 'email',
        query: 'admin-email@ims.test',
        limit: 50,
        offset: 0,
        activeAt: AT
    });
    assert.deepEqual(byEmail.map((record) => record.id), ['admin-email']);

    const byName = await fixture.platform.listPlatformAccountsForAdmin({
        field: 'display_name',
        query: 'ada%',
        limit: 50,
        offset: 0,
        activeAt: AT
    });
    assert.deepEqual(byName.map((record) => record.id), ['admin-email']);

    assert.equal(
        await fixture.platform.countPlatformAccountsForAdmin({
            field: 'id',
            query: null
        }),
        2
    );

    // The projection is the guard against hash leakage: assert the shape the
    // wire contract promises has no credential secret in it.
    assert.deepEqual(
        Object.keys(emailRow!).sort(),
        [
            'active_session_count',
            'created_at',
            'display_name',
            'has_password',
            'id',
            'last_login_at',
            'normalized_email',
            'status',
            'updated_at'
        ]
    );
});

test('suspending an account bumps the token version and revokes live sessions atomically', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'admin-suspend';
    await fixture.platform.createEmailAccount(emailAccount(accountId));
    await insertRefreshSession(fixture.harness, { id: 'suspend-live', accountId });
    await insertRefreshSession(fixture.harness, {
        id: 'suspend-expired',
        accountId,
        createdAt: AT - 100,
        expiresAt: AT - 1
    });

    const input: SetPlatformAccountStatusInput = {
        accountId,
        status: 'suspended',
        expectedUpdatedAt: AT,
        updatedAt: AT + 1_000,
        event: event(accountId, 'auth.account_blocked')
    };
    const result = await fixture.platform.setPlatformAccountStatus(input);

    assert.equal(result.status, 'saved');
    if (result.status !== 'saved') return;
    assert.equal(result.changed, true);
    assert.equal(result.account.status, 'suspended');
    const account = await accountStatus(fixture, accountId);
    assert.equal(account?.token_version, 1);
    assert.equal(await liveSessionCount(fixture, accountId), 0);

    // Idempotent with the fresh revision: the same target status is a no-op,
    // so the version does not climb on a repeated click.
    const repeat = await fixture.platform.setPlatformAccountStatus({
        ...input,
        expectedUpdatedAt: AT + 1_000
    });
    assert.equal(repeat.status, 'saved');
    if (repeat.status !== 'saved') return;
    assert.equal(repeat.changed, false);
    assert.equal((await accountStatus(fixture, accountId))?.token_version, 1);
});

test('reactivating a suspended account restores it without bumping twice', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'admin-reactivate';
    await fixture.platform.createEmailAccount(emailAccount(accountId));
    await fixture.platform.setPlatformAccountStatus({
        accountId,
        status: 'suspended',
        expectedUpdatedAt: AT,
        updatedAt: AT + 1_000,
        event: event(accountId, 'auth.account_blocked')
    });

    const result = await fixture.platform.setPlatformAccountStatus({
        accountId,
        status: 'active',
        expectedUpdatedAt: AT + 1_000,
        updatedAt: AT + 2_000,
        event: event(accountId, 'auth.account.reactivated')
    });

    assert.equal(result.status, 'saved');
    if (result.status !== 'saved') return;
    assert.equal(result.account.status, 'active');
    assert.equal((await accountStatus(fixture, accountId))?.token_version, 1);
});

test('a stale status revision reports conflict with the current projection', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'admin-conflict';
    await fixture.platform.createEmailAccount(emailAccount(accountId));

    const result = await fixture.platform.setPlatformAccountStatus({
        accountId,
        status: 'suspended',
        expectedUpdatedAt: AT - 1,
        updatedAt: AT + 1_000,
        event: event(accountId, 'auth.account_blocked')
    });

    assert.equal(result.status, 'conflict');
    if (result.status !== 'conflict') return;
    assert.equal(result.account.updated_at, AT);
});

test('activating a restricted account is unsupported', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'admin-restricted';
    await fixture.platform.createEmailAccount(emailAccount(accountId));
    await fixture.harness.connection
        .prepare(`UPDATE platform_accounts SET status='restricted' WHERE id=?`)
        .bind(accountId)
        .run();

    const result = await fixture.platform.setPlatformAccountStatus({
        accountId,
        status: 'active',
        expectedUpdatedAt: AT,
        updatedAt: AT + 1_000,
        event: event(accountId, 'auth.account.reactivated')
    });

    assert.equal(result.status, 'unsupported');
});

test('forcing a logout revokes every live session and is idempotent', async (t) => {
    const fixture = await createFixture(t);
    const accountId = 'admin-force-logout';
    await fixture.platform.createEmailAccount(emailAccount(accountId));
    await insertRefreshSession(fixture.harness, { id: 'force-one', accountId });
    await insertRefreshSession(fixture.harness, { id: 'force-two', accountId });

    const input: ForceLogoutPlatformAccountInput = {
        accountId,
        revokedAt: AT + 1_000,
        event: event(accountId, 'auth.session.revoked')
    };
    const result = await fixture.platform.forceLogoutPlatformAccount(input);

    assert.equal(result.status, 'saved');
    if (result.status !== 'saved') return;
    assert.equal(result.revokedSessionCount, 2);
    assert.equal((await accountStatus(fixture, accountId))?.token_version, 1);
    assert.equal(await liveSessionCount(fixture, accountId), 0);

    const repeat = await fixture.platform.forceLogoutPlatformAccount({
        accountId,
        revokedAt: AT + 2_000,
        event: event(accountId, 'auth.session.revoked')
    });
    assert.equal(repeat.status, 'saved');
    if (repeat.status !== 'saved') return;
    assert.equal(repeat.revokedSessionCount, 0);
});
