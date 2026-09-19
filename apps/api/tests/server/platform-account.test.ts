// Merged from 3 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import { readContractJson as assertRawJsonConforms } from '../contracts/contract-json';
import { ACCOUNT_ID, AccountSecurityFixture, bearerHeaders, cookieHeaders, CURRENT_PASSWORD, CURRENT_SESSION_ID, DISABLED_PROVIDER, EXPIRED_SESSION_ID, FOREIGN_ACCOUNT_ID, FOREIGN_PROVIDER, FOREIGN_SESSION_ID, GITHUB_PROVIDER, GOOGLE_PROVIDER, NEXT_PASSWORD, oauthLink, passwordBody, REVOKED_SESSION_ID, SECOND_DEVICE_SESSION_ID, storedDigest, THIRD_DEVICE_SESSION_ID } from '../fixtures/account-security-fixture';
import { createPostgresTestHarness, type PostgresTestHarness } from '../integration/postgres-harness';
import { postgresTest } from '../postgres-test-database';
import { SqlPlatformAccountRepository } from '@/infra/db/repositories/platform-account-repository';
import type { SqlSchemaStrategy } from '@/infra/db/sql/database';
import type { PlatformOAuthProviderCode } from '@/ports/oauth';
import type { CreatePlatformEmailCredentialInput, CreatePlatformOAuthIdentityForAccountInput, ForceLogoutPlatformAccountInput, NewPlatformEmailAccountInput, NewPlatformOAuthAccountInput, PlatformSecurityEventInput, SetPlatformAccountStatusInput } from '@/ports/repositories';
import { platformHttpErrorSchema } from '@imsweb/contracts/platform';
import { platformOAuthLinkListResponseSchema, platformOAuthUnlinkResponseSchema, platformPasswordChangeResponseSchema, platformSessionListResponseSchema, platformSessionRevocationResponseSchema } from '@imsweb/contracts/platform/account-security';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, onTestFinished, test } from 'vitest';

// platform-account-admin-repository.test.ts
{
    /**
 * `listPlatformAccountsForAdmin` / `setPlatformAccountStatus` /
 * `forceLogoutPlatformAccount` carry the rules that keep an admin suspension
 * from being cosmetic: the status write, the `token_version` bump and the
 * refresh-session sweep are one batch, and the admin projection must not carry
 * a credential secret. The contract suite drives those capabilities through a
 * fake repository, so the SQL predicates themselves are pinned here against a
 * real PostgreSQL.
 */

    const AT = 1_776_000_000_000;
    const HOUR = 60 * 60 * 1000;

    // `platform_refresh_sessions` checks both hashes against `^[0-9a-f]{64}$`.
    function hashOf(value: string): string {
        return createHash('sha256').update(value).digest('hex');
    }

    const initializedPostgresSchema: SqlSchemaStrategy = {
        initializeCore: async () => undefined,
        initializePlatform: async () => undefined,
        initializeFudaba: async () => undefined,
        initializeStory: async () => undefined
    };

    function profile(id: string, displayName = `Producer ${id}`) {
        return {
            displayName,
            avatarObjectKey: null,
            avatarExternalUrl: null,
            homeCity: null,
            bio: '',
            updatedAt: AT
        };
    }

    function emailAccount(
        id: string,
        options: { displayName?: string; email?: string } = {}
    ): NewPlatformEmailAccountInput {
        return {
            id,
            status: 'active',
            tokenVersion: 0,
            createdAt: AT,
            updatedAt: AT,
            deletedAt: null,
            profile: profile(id, options.displayName),
            credential: {
                normalizedEmail: options.email ?? `${id}@ims.test`,
                algorithm: 'bcrypt',
                parametersJson: JSON.stringify({ cost: 12 }),
                passwordHash: `hash-${id}`,
                createdAt: AT,
                updatedAt: AT
            }
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

    function event(accountId: string, eventType: PlatformSecurityEventInput['eventType']) {
        return (): PlatformSecurityEventInput => ({
            id: `event-${accountId}-${Math.random().toString(36).slice(2)}`,
            accountId,
            eventType,
            requestId: null,
            ipAddress: null,
            userAgent: null,
            metadataJson: '{}',
            createdAt: AT
        });
    }

    async function createFixture() {
        const harness = await createPostgresTestHarness();
        const platform = new SqlPlatformAccountRepository(
            harness.connection,
            initializedPostgresSchema
        );
        onTestFinished(() => harness.close());
        await platform.initialize();
        return {
            platform,
            createSession: async (
                accountId: string,
                tokenVersion: number,
                sessionId: string
            ) =>
                platform.createRefreshSession({
                    id: sessionId,
                    accountId,
                    accountTokenVersion: tokenVersion,
                    tokenHash: hashOf(`token-${sessionId}`),
                    csrfHash: hashOf(`csrf-${sessionId}`),
                    expiresAt: AT + 24 * HOUR,
                    createdAt: AT,
                    userAgent: 'admin-test',
                    ipAddress: '127.0.0.1',
                    event: event(accountId, 'auth.session.created')()
                }),
            activeSessions: async (accountId: string) => {
                const rows = await harness.connection
                    .prepare(
                        `SELECT id FROM platform_refresh_sessions
                     WHERE account_id=? AND revoked_at IS NULL AND expires_at>?`
                    )
                    .bind(accountId, AT)
                    .all<{ id: string }>();
                return (rows.results ?? []).map((row) => row.id).sort();
            },
            tokenVersion: async (accountId: string) => {
                const row = await harness.connection
                    .prepare('SELECT token_version FROM platform_accounts WHERE id=?')
                    .bind(accountId)
                    .first<{ token_version: number }>();
                return Number(row?.token_version ?? -1);
            },
            rawAccount: async (accountId: string) => {
                const row = await harness.connection
                    .prepare('SELECT status, updated_at, deleted_at FROM platform_accounts WHERE id=?')
                    .bind(accountId)
                    .first<{ status: string; updated_at: number; deleted_at: number | null }>();
                return row ?? null;
            }
        };
    }

    describe('platform account admin repository', () => {
        postgresTest('admin list searches by id, email and display name and hides deleted accounts', async () => {
            const fixture = await createFixture();
            await fixture.platform.createEmailAccount(
                emailAccount('list-a', { displayName: 'Alpha Producer', email: 'alpha@ims.test' })
            );
            await fixture.platform.createEmailAccount(
                emailAccount('list-b', { displayName: 'Beta Producer', email: 'beta@ims.test' })
            );
            await fixture.platform.createEmailAccount({
                ...emailAccount('list-gone', { displayName: 'Ghost Producer' }),
                status: 'deleted',
                deletedAt: AT
            });

            const context = {
                limit: 10,
                offset: 0,
                activeAt: AT
            } as const;

            const byId = await fixture.platform.listPlatformAccountsForAdmin({
                ...context,
                field: 'id',
                query: 'list-a'
            });
            assert.deepEqual(byId.map((row) => row.id), ['list-a']);

            const byEmail = await fixture.platform.listPlatformAccountsForAdmin({
                ...context,
                field: 'email',
                query: 'beta@ims.test'
            });
            assert.deepEqual(byEmail.map((row) => row.id), ['list-b']);

            const byName = await fixture.platform.listPlatformAccountsForAdmin({
                ...context,
                field: 'display_name',
                // The repository receives the full LIKE pattern; the domain adapter is
                // what adds the `%` delimiters around the escaped term.
                query: '%Alpha Prod%'
            });
            assert.deepEqual(byName.map((row) => row.id), ['list-a']);

            const all = await fixture.platform.listPlatformAccountsForAdmin({
                ...context,
                field: 'id',
                query: null
            });
            assert.deepEqual(
                all.map((row) => row.id).sort(),
                ['list-a', 'list-b']
            );

            const none = await fixture.platform.listPlatformAccountsForAdmin({
                ...context,
                field: 'email',
                query: 'missing@ims.test'
            });
            assert.deepEqual(none, []);
            assert.equal(
                await fixture.platform.countPlatformAccountsForAdmin({
                    field: 'email',
                    query: 'missing@ims.test'
                }),
                0
            );
            assert.equal(
                await fixture.platform.countPlatformAccountsForAdmin({
                    field: 'id',
                    query: null
                }),
                2
            );

            const row = byEmail[0]!;
            assert.equal(row.has_password, true);
            assert.equal(row.normalized_email, 'beta@ims.test');
            const serialized = JSON.stringify(row);
            for (const secret of ['password_hash', 'salt', 'parameters_json', 'token_hash', 'csrf_hash']) {
                assert.equal(serialized.includes(secret), false, `${secret} must not be projected`);
            }
        });

        postgresTest('admin list counts only live refresh sessions and reports them without leaking hashes', async () => {
            const fixture = await createFixture();
            await fixture.platform.createEmailAccount(emailAccount('sessions-a'));
            assert.equal(await fixture.createSession('sessions-a', 0, 'live-1'), true);
            assert.equal(await fixture.createSession('sessions-a', 0, 'live-2'), true);

            const [record] = await fixture.platform.listPlatformAccountsForAdmin({
                field: 'id',
                query: 'sessions-a',
                limit: 1,
                offset: 0,
                activeAt: AT
            });
            assert.equal(record?.active_session_count, 2);
            assert.equal(record?.last_login_at, AT);
        });

        postgresTest('suspending bumps token_version, sweeps live sessions and is not affected by a lost race', async () => {
            const fixture = await createFixture();
            await fixture.platform.createEmailAccount(emailAccount('suspend-a'));
            assert.equal(await fixture.createSession('suspend-a', 0, 'killed-1'), true);

            const suspended = await fixture.platform.setPlatformAccountStatus({
                accountId: 'suspend-a',
                status: 'suspended',
                expectedUpdatedAt: AT,
                updatedAt: AT + 1,
                event: event('suspend-a', 'auth.account_blocked')()
            });
            assert.equal(suspended.status, 'saved');
            assert.equal(suspended.changed, true);
            assert.equal(await fixture.tokenVersion('suspend-a'), 1);
            assert.deepEqual(await fixture.activeSessions('suspend-a'), []);
            assert.equal((await fixture.rawAccount('suspend-a'))?.status, 'suspended');
            assert.equal((await fixture.rawAccount('suspend-a'))?.deleted_at, null);

            const reactivated = await fixture.platform.setPlatformAccountStatus({
                accountId: 'suspend-a',
                status: 'active',
                expectedUpdatedAt: AT + 1,
                updatedAt: AT + 2,
                event: event('suspend-a', 'auth.account.reactivated')()
            });
            assert.equal(reactivated.status, 'saved');
            // Reactivation does not hand back the old version; a fresh login is required.
            assert.equal(await fixture.tokenVersion('suspend-a'), 1);
            assert.equal(
                await fixture.createSession('suspend-a', 1, 'after-reactivation'),
                true
            );

            const sameStatus = await fixture.platform.setPlatformAccountStatus({
                accountId: 'suspend-a',
                status: 'active',
                expectedUpdatedAt: AT + 2,
                updatedAt: AT + 3,
                event: event('suspend-a', 'auth.account.reactivated')()
            });
            assert.equal(sameStatus.status, 'saved');
            assert.equal(sameStatus.changed, false);
            assert.equal(await fixture.tokenVersion('suspend-a'), 1);
        });

        postgresTest('a stale status write reports a conflict and leaves sessions alone', async () => {
            const fixture = await createFixture();
            await fixture.platform.createEmailAccount(emailAccount('stale-a'));
            assert.equal(await fixture.createSession('stale-a', 0, 'survivor'), true);

            const conflicted = await fixture.platform.setPlatformAccountStatus({
                accountId: 'stale-a',
                status: 'suspended',
                expectedUpdatedAt: AT + 99,
                updatedAt: AT + 100,
                event: event('stale-a', 'auth.account_blocked')()
            });
            assert.equal(conflicted.status, 'conflict');
            assert.equal(await fixture.tokenVersion('stale-a'), 0);
            assert.deepEqual(await fixture.activeSessions('stale-a'), ['survivor']);
        });

        postgresTest('activating a restricted account is unsupported and unknown ids are not-found', async () => {
            const fixture = await createFixture();
            await fixture.platform.createEmailAccount({
                ...emailAccount('restricted-a'),
                status: 'restricted'
            });

            const unsupported = await fixture.platform.setPlatformAccountStatus({
                accountId: 'restricted-a',
                status: 'active',
                expectedUpdatedAt: AT,
                updatedAt: AT + 1,
                event: event('restricted-a', 'auth.account.reactivated')()
            });
            assert.equal(unsupported.status, 'unsupported');

            const missing = await fixture.platform.setPlatformAccountStatus({
                accountId: 'nobody',
                status: 'suspended',
                expectedUpdatedAt: AT,
                updatedAt: AT + 1,
                event: event('nobody', 'auth.account_blocked')()
            });
            assert.equal(missing.status, 'not-found');
        });

        postgresTest('force logout revokes every live session, bumps the version and is idempotent', async () => {
            const fixture = await createFixture();
            await fixture.platform.createEmailAccount(emailAccount('logout-a'));
            assert.equal(await fixture.createSession('logout-a', 0, 'one'), true);
            assert.equal(await fixture.createSession('logout-a', 0, 'two'), true);

            const first = await fixture.platform.forceLogoutPlatformAccount({
                accountId: 'logout-a',
                revokedAt: AT + 1,
                event: event('logout-a', 'auth.session.revoked')()
            });
            assert.equal(first.status, 'saved');
            assert.equal(first.status === 'saved' ? first.revokedSessionCount : -1, 2);
            assert.equal(await fixture.tokenVersion('logout-a'), 1);
            assert.deepEqual(await fixture.activeSessions('logout-a'), []);

            const second = await fixture.platform.forceLogoutPlatformAccount({
                accountId: 'logout-a',
                revokedAt: AT + 2,
                event: event('logout-a', 'auth.session.revoked')()
            });
            assert.equal(second.status, 'saved');
            assert.equal(second.status === 'saved' ? second.revokedSessionCount : -1, 0);

            const missing = await fixture.platform.forceLogoutPlatformAccount({
                accountId: 'nobody',
                revokedAt: AT + 2,
                event: event('nobody', 'auth.session.revoked')()
            });
            assert.equal(missing.status, 'not-found');
        });

        postgresTest('the last-credential guard still refuses unlinking an OAuth-only account', async () => {
            const fixture = await createFixture();
            await fixture.platform.createOAuthAccount(oauthAccount('oauth-only', 'github'));

            const refused = await fixture.platform.deleteOAuthIdentity({
                accountId: 'oauth-only',
                providerCode: 'github',
                event: event('oauth-only', 'auth.oauth.unlinked')()
            });
            assert.equal(refused.status, 'last-login-method');
        });
    });
}

// platform-account-management-repository.test.ts
{
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

    async function createFixture(): Promise<Fixture> {
        const harness = await createPostgresTestHarness();
        onTestFinished(() => harness.close());
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

    describe('platform account management repository', () => {
        postgresTest('linking an identity writes the row and its audit event', async () => {
            const fixture = await createFixture();
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

        postgresTest('re-linking the same subject to the same account is idempotent', async () => {
            const fixture = await createFixture();
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

        postgresTest('a subject owned by another account is refused without a write', async () => {
            const fixture = await createFixture();
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

        postgresTest('a second subject for the same provider on one account is a provider conflict', async () => {
            const fixture = await createFixture();
            const accountId = 'link-provider-conflict';
            await fixture.platform.createOAuthAccount(oauthAccount(accountId, 'google', 'first-subject'));

            const result = await fixture.platform.createOAuthIdentityForAccount(
                linkInput(accountId, 'google', 'second-subject')
            );

            assert.equal(result.status, 'provider-conflict');
        });

        postgresTest('linking to a missing or inactive account is not found', async () => {
            const fixture = await createFixture();

            const result = await fixture.platform.createOAuthIdentityForAccount(
                linkInput('missing-account', 'github', 'gh-subject')
            );

            assert.equal(result.status, 'not-found');
        });

        postgresTest('two concurrent links of one subject resolve to exactly one owner', async () => {
            const fixture = await createFixture();
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

        postgresTest('two unlinks cannot strip every login method', async () => {
            const fixture = await createFixture();
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

        postgresTest('binding an email credential consumes the code and survives a password hash', async () => {
            const fixture = await createFixture();
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

        postgresTest('binding a second credential for one account is already-bound and keeps the code', async () => {
            const fixture = await createFixture();
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

        postgresTest('binding a taken address reports email-conflict and rolls the code back', async () => {
            const fixture = await createFixture();
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

        postgresTest('a wrong binding code leaves the credential unwritten', async () => {
            const fixture = await createFixture();
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

        postgresTest('migrating an email keeps the password hash, algorithm and salt', async () => {
            const fixture = await createFixture();
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

        postgresTest('a stale migration expectation reports state-conflict', async () => {
            const fixture = await createFixture();
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

        postgresTest('migrating without a bound credential reports not-bound', async () => {
            const fixture = await createFixture();
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

        postgresTest('two concurrent binds for one account produce exactly one credential', async () => {
            const fixture = await createFixture();
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

        postgresTest('a link state round-trips its account and intent', async () => {
            const fixture = await createFixture();
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

        postgresTest('an app state carries its challenge and survives the read-only return-channel lookup', async () => {
            const fixture = await createFixture();
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

            assert.deepEqual(
                await fixture.platform.findOAuthStateReturnChannel(
                    sha('state-app'),
                    'google',
                    AT
                ),
                { clientTarget: 'app', intent: 'login' }
            );
            // The lookup must not consume the row; the callback still has to redeem it.
            const consumed = await fixture.platform.consumeOAuthState(sha('state-app'), 'google', AT);
            assert.equal(consumed?.app_code_challenge, challenge);
        });

        // ── One-time exchange codes ───────────────────────────────────────────────

        postgresTest('an exchange code is consumed exactly once', async () => {
            const fixture = await createFixture();
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

        postgresTest('an expired exchange code is not returned', async () => {
            const fixture = await createFixture();
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

        postgresTest('a concurrent exchange redeems the code for exactly one caller', async () => {
            const fixture = await createFixture();
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

        postgresTest('admin listing searches by id, email and display name and excludes deleted accounts', async () => {
            const fixture = await createFixture();
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

        postgresTest('suspending an account bumps the token version and revokes live sessions atomically', async () => {
            const fixture = await createFixture();
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

        postgresTest('reactivating a suspended account restores it without bumping twice', async () => {
            const fixture = await createFixture();
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

        postgresTest('a stale status revision reports conflict with the current projection', async () => {
            const fixture = await createFixture();
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

        postgresTest('activating a restricted account is unsupported', async () => {
            const fixture = await createFixture();
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

        postgresTest('forcing a logout revokes every live session and is idempotent', async () => {
            const fixture = await createFixture();
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
    });
}

// platform-account-security.contract.test.ts
{
    const PASSWORD_URL = 'http://ims.test/api/platform/me/password';
    const SESSIONS_URL = 'http://ims.test/api/platform/me/sessions';
    const OAUTH_LINKS_URL = 'http://ims.test/api/platform/me/oauth-links';

    // The two shapes the unlink guard has to tell apart. Both accounts are
    // password-less, so the OAuth links are the only thing keeping them reachable.
    const TWO_ENABLED_LINKS = [
        oauthLink(GOOGLE_PROVIDER),
        oauthLink(GITHUB_PROVIDER, { created_at: 4_000 })
    ];
    const ONE_ENABLED_ONE_DISABLED = [
        oauthLink(GOOGLE_PROVIDER),
        oauthLink(DISABLED_PROVIDER, { created_at: 4_000, provider_enabled: false })
    ];

    interface ErrorBody {
        code?: string;
        error?: string;
        success?: boolean;
    }

    async function changePassword(
        fixture: AccountSecurityFixture,
        body: string,
        headers: Record<string, string> = bearerHeaders()
    ): Promise<Response> {
        return await fixture.app.request(PASSWORD_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body
        });
    }

    async function listSessions(fixture: AccountSecurityFixture): Promise<Response> {
        return await fixture.app.request(SESSIONS_URL, { headers: bearerHeaders() });
    }

    async function listOAuthLinks(
        fixture: AccountSecurityFixture
    ): Promise<Response> {
        return await fixture.app.request(OAUTH_LINKS_URL, {
            headers: bearerHeaders()
        });
    }

    async function unlink(
        fixture: AccountSecurityFixture,
        provider: string,
        headers: Record<string, string> = bearerHeaders()
    ): Promise<Response> {
        return await fixture.app.request(`${OAUTH_LINKS_URL}/${provider}`, {
            method: 'DELETE',
            headers
        });
    }

    test.describe('platform account security', () => {
        test('raw JSON conforms across password, sessions, and OAuth unlink', async () => {
            const fixture = new AccountSecurityFixture();

            const listed = await listSessions(fixture);
            assert.equal(listed.status, 200);
            await assertRawJsonConforms(listed, platformSessionListResponseSchema);

            const revoked = await fixture.app.request(`${SESSIONS_URL}/${SECOND_DEVICE_SESSION_ID}`, {
                method: 'DELETE',
                headers: bearerHeaders()
            });
            assert.equal(revoked.status, 200);
            await assertRawJsonConforms(revoked, platformSessionRevocationResponseSchema);

            const unlinked = await unlink(fixture, GOOGLE_PROVIDER);
            assert.equal(unlinked.status, 200);
            await assertRawJsonConforms(unlinked, platformOAuthUnlinkResponseSchema);

            const changed = await changePassword(fixture, passwordBody());
            assert.equal(changed.status, 200);
            await assertRawJsonConforms(changed, platformPasswordChangeResponseSchema);

            const anonymous = await fixture.app.request(SESSIONS_URL);
            assert.equal(anonymous.status, 401);
            await assertRawJsonConforms(anonymous, platformHttpErrorSchema);
        });

        test('rejects anonymous callers', async () => {
            const fixture = new AccountSecurityFixture();
            const unauthenticated = [
                await fixture.app.request(PASSWORD_URL, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: passwordBody()
                }),
                await fixture.app.request(SESSIONS_URL),
                await fixture.app.request(SESSIONS_URL, { method: 'DELETE' }),
                await fixture.app.request(`${SESSIONS_URL}/${SECOND_DEVICE_SESSION_ID}`, {
                    method: 'DELETE'
                })
            ];
            for (const response of unauthenticated) {
                assert.equal(response.status, 401);
                assert.equal(
                    ((await response.json()) as ErrorBody).code,
                    'PLATFORM_SESSION_INVALID'
                );
            }
            // Nothing was touched on the way to the 401.
            assert.deepEqual(fixture.liveSessionIds(), [
                CURRENT_SESSION_ID,
                SECOND_DEVICE_SESSION_ID,
                THIRD_DEVICE_SESSION_ID
            ].sort());
        });

        test('a wrong current password is refused without disturbing the account', async () => {
            const fixture = new AccountSecurityFixture();
            const response = await changePassword(
                fixture,
                passwordBody({ currentPassword: 'not-the-password' })
            );

            // 403 rather than 401: the session is intact and only the re-authentication
            // proof failed. The Web client answers every 401 with a refresh-and-retry
            // wave, which would spend the refresh token over a typo.
            assert.equal(response.status, 403);
            assert.equal(
                ((await response.json()) as ErrorBody).code,
                'PLATFORM_PASSWORD_CURRENT_INVALID'
            );
            assert.equal(fixture.credential?.password_hash, storedDigest(CURRENT_PASSWORD));
            assert.equal(fixture.tokenVersion, 0);
            assert.deepEqual(fixture.liveSessionIds(), [
                CURRENT_SESSION_ID,
                SECOND_DEVICE_SESSION_ID,
                THIRD_DEVICE_SESSION_ID
            ].sort());
            assert.deepEqual(fixture.passwordInputs, []);
        });

        const invalidSubmissions: Array<{ body: string; label: string }> = [
            { label: 'new password under 8 characters', body: passwordBody({ newPassword: 'short12' }) },
            {
                label: 'new password over 128 characters',
                body: passwordBody({ newPassword: 'a'.repeat(129) })
            },
            {
                // bcrypt silently truncates past 72 bytes, so the rule is a byte budget
                // rather than a character count.
                label: 'new password over 72 UTF-8 bytes',
                body: passwordBody({ newPassword: '密'.repeat(25) })
            },
            { label: 'non-string new password', body: passwordBody({ newPassword: 42 }) },
            { label: 'null new password', body: passwordBody({ newPassword: null }) },
            { label: 'blank current password', body: passwordBody({ currentPassword: '   ' }) },
            { label: 'missing current password', body: JSON.stringify({ newPassword: NEXT_PASSWORD }) },
            { label: 'missing new password', body: JSON.stringify({ currentPassword: CURRENT_PASSWORD }) },
            { label: 'unknown field', body: passwordBody({ confirmPassword: NEXT_PASSWORD }) },
            { label: 'array body', body: '[]' },
            { label: 'null body', body: 'null' },
            { label: 'malformed JSON', body: '{"currentPassword":' }
        ];

        for (const submission of invalidSubmissions) {
            test(`password change rejects ${submission.label}`, async () => {
                const fixture = new AccountSecurityFixture();
                const response = await changePassword(fixture, submission.body);

                assert.equal(response.status, 400);
                assert.equal(
                    ((await response.json()) as ErrorBody).code,
                    'PLATFORM_PASSWORD_INPUT_INVALID'
                );
                assert.equal(fixture.tokenVersion, 0);
                assert.deepEqual(fixture.passwordInputs, []);
            });
        }

        test('password change refuses to reuse the current password', async () => {
            const fixture = new AccountSecurityFixture();
            const response = await changePassword(
                fixture,
                passwordBody({ newPassword: CURRENT_PASSWORD })
            );

            // A no-op that still bumps token_version and drops every other device is
            // more damage than the request asked for.
            assert.equal(response.status, 400);
            assert.equal(
                ((await response.json()) as ErrorBody).code,
                'PLATFORM_PASSWORD_UNCHANGED'
            );
            assert.equal(fixture.tokenVersion, 0);
            assert.deepEqual(fixture.liveSessionIds().length, 3);
        });

        test('password change requires a JSON content type', async () => {
            const fixture = new AccountSecurityFixture();
            const response = await changePassword(fixture, passwordBody(), {
                ...bearerHeaders(),
                'content-type': 'text/plain'
            });

            assert.equal(response.status, 415);
            assert.equal(
                ((await response.json()) as ErrorBody).code,
                'PLATFORM_AUTH_JSON_REQUIRED'
            );
        });

        test('a successful password change keeps this session and drops the others', async () => {
            const fixture = new AccountSecurityFixture();
            const response = await changePassword(fixture, passwordBody());

            assert.equal(response.status, 200);
            const body = platformPasswordChangeResponseSchema.parse(await response.json());
            // Two live siblings, not three: the already-expired row is left alone so
            // this count matches the device list the user was just looking at.
            assert.equal(body.revokedSessionCount, 2);
            // Cookie callers read the rotated tokens from Set-Cookie, so the body must
            // not carry them.
            assert.equal(body.accessToken, undefined);
            assert.equal(body.refreshToken, undefined);

            assert.equal(fixture.credential?.password_hash, storedDigest(NEXT_PASSWORD));
            // token_version moves so every access token minted before now is dead.
            assert.equal(fixture.tokenVersion, 1);
            // The replacement access token was minted for the new version, which is what
            // lets the caller stay signed in.
            assert.equal(fixture.signedTokenVersions.includes(1), true);
            // The kept session was re-armed with a fresh refresh token hash.
            const kept = fixture.sessions.get(CURRENT_SESSION_ID)!;
            assert.equal(kept.revoked_at, null);
            assert.notEqual(kept.token_hash, `token-hash-${CURRENT_SESSION_ID}`);
            assert.equal(kept.previous_token_hash, null);

            assert.deepEqual(fixture.liveSessionIds(), [CURRENT_SESSION_ID]);
            for (const id of [SECOND_DEVICE_SESSION_ID, THIRD_DEVICE_SESSION_ID]) {
                assert.notEqual(fixture.sessions.get(id)!.revoked_at, null);
            }
            // An expired refresh token cannot be redeemed, so revoking it would buy
            // nothing and only inflate the number reported to the user.
            assert.equal(fixture.sessions.get(EXPIRED_SESSION_ID)!.revoked_at, null);
            // A different account's session is none of this account's business.
            assert.equal(fixture.sessions.get(FOREIGN_SESSION_ID)!.revoked_at, null);

            // The current session is still usable after the change.
            const followUp = await listSessions(fixture);
            assert.equal(followUp.status, 200);
            assert.deepEqual(
                platformSessionListResponseSchema.parse(await followUp.json())
                    .sessions.map((entry) => entry.id),
                [CURRENT_SESSION_ID]
            );
        });

        test('packaged clients receive the rotated tokens in the body', async () => {
            const fixture = new AccountSecurityFixture();
            const response = await changePassword(fixture, passwordBody(), {
                ...bearerHeaders(),
                'x-ims-auth-mode': 'bearer'
            });

            assert.equal(response.status, 200);
            const body = platformPasswordChangeResponseSchema.parse(await response.json());
            // A packaged client has no cookie jar, so Set-Cookie alone would strand it.
            assert.equal(typeof body.accessToken, 'string');
            assert.equal(typeof body.refreshToken, 'string');
            assert.match(body.refreshToken!, /^v1\.1\./);
        });

        test('an account without an email credential cannot change a password', async () => {
            const fixture = new AccountSecurityFixture({ credential: null });
            const response = await changePassword(fixture, passwordBody());

            assert.equal(response.status, 409);
            assert.equal(
                ((await response.json()) as ErrorBody).code,
                'PLATFORM_PASSWORD_UNAVAILABLE'
            );
        });

        test('the session list never exposes a session secret', async () => {
            const fixture = new AccountSecurityFixture();
            const response = await listSessions(fixture);

            assert.equal(response.status, 200);
            const raw = await response.text();
            // The three hash columns are session-bearer credentials. Assert against the
            // raw payload so a leak cannot hide behind a renamed field.
            for (const secret of ['token_hash', 'csrf_hash', 'previous_token_hash',
                'tokenHash', 'csrfHash', 'previousTokenHash']) {
                assert.equal(raw.includes(secret), false, `${secret} leaked`);
            }
            const current = fixture.sessions.get(CURRENT_SESSION_ID)!;
            for (const value of [current.token_hash, current.csrf_hash]) {
                assert.equal(raw.includes(value), false, 'a hash value leaked');
            }

            // The contract schema is strict, so any extra field fails here too.
            const body = platformSessionListResponseSchema.parse(JSON.parse(raw));
            assert.deepEqual(
                body.sessions.map((entry) => entry.id).sort(),
                [CURRENT_SESSION_ID, SECOND_DEVICE_SESSION_ID, THIRD_DEVICE_SESSION_ID].sort()
            );
            // Revoked and expired rows are not devices the owner can still act on.
            for (const id of [REVOKED_SESSION_ID, EXPIRED_SESSION_ID, FOREIGN_SESSION_ID]) {
                assert.equal(body.sessions.some((entry) => entry.id === id), false);
            }
            assert.deepEqual(
                body.sessions.filter((entry) => entry.current).map((entry) => entry.id),
                [CURRENT_SESSION_ID]
            );
            const listed = body.sessions.find((entry) => entry.id === SECOND_DEVICE_SESSION_ID)!;
            assert.equal(listed.userAgent, `agent/${SECOND_DEVICE_SESSION_ID}`);
            assert.equal(listed.ipAddress, '203.0.113.7');
        });

        test('revoking one session only reaches this account', async () => {
            const fixture = new AccountSecurityFixture();
            const response = await fixture.app.request(
                `${SESSIONS_URL}/${SECOND_DEVICE_SESSION_ID}`,
                { method: 'DELETE', headers: bearerHeaders() }
            );

            assert.equal(response.status, 200);
            assert.deepEqual(
                platformSessionRevocationResponseSchema.parse(await response.json()),
                { success: true, revokedSessionCount: 1 }
            );
            assert.deepEqual(fixture.liveSessionIds(), [
                CURRENT_SESSION_ID,
                THIRD_DEVICE_SESSION_ID
            ].sort());
        });

        test('a session owned by another account cannot be revoked', async () => {
            const fixture = new AccountSecurityFixture();
            const foreign = await fixture.app.request(
                `${SESSIONS_URL}/${FOREIGN_SESSION_ID}`,
                { method: 'DELETE', headers: bearerHeaders() }
            );

            // Reported exactly like an unknown id: distinguishing the two would turn the
            // endpoint into an oracle for probing live session ids.
            assert.equal(foreign.status, 404);
            assert.equal(
                ((await foreign.json()) as ErrorBody).code,
                'PLATFORM_SESSION_NOT_FOUND'
            );
            assert.equal(fixture.sessions.get(FOREIGN_SESSION_ID)!.revoked_at, null);
            assert.deepEqual(fixture.liveSessionIds(FOREIGN_ACCOUNT_ID), [FOREIGN_SESSION_ID]);

            for (const id of [
                'missing-session',
                REVOKED_SESSION_ID,
                encodeURIComponent(' '),
                'a'.repeat(129)
            ]) {
                const response = await fixture.app.request(`${SESSIONS_URL}/${id}`, {
                    method: 'DELETE',
                    headers: bearerHeaders()
                });
                assert.equal(response.status, 404, id);
                assert.equal(
                    ((await response.json()) as ErrorBody).code,
                    'PLATFORM_SESSION_NOT_FOUND',
                    id
                );
            }

            const trailingSlash = await fixture.app.request(`${SESSIONS_URL}/`, {
                method: 'DELETE',
                headers: bearerHeaders()
            });
            assert.equal(
                trailingSlash.status === 404 || trailingSlash.status === 200,
                true
            );
            if (trailingSlash.status === 200) {
                assert.equal(
                    (await trailingSlash.json() as { revokedSessionCount: number })
                        .revokedSessionCount,
                    2
                );
            }
        });

        test('signing out everywhere else keeps the calling session', async () => {
            const fixture = new AccountSecurityFixture();
            const response = await fixture.app.request(SESSIONS_URL, {
                method: 'DELETE',
                headers: bearerHeaders()
            });

            assert.equal(response.status, 200);
            const body = platformSessionRevocationResponseSchema.parse(await response.json());
            // Live siblings only, matching what GET /me/sessions reports.
            assert.equal(body.revokedSessionCount, 2);
            assert.deepEqual(fixture.liveSessionIds(), [CURRENT_SESSION_ID]);
            assert.equal(fixture.sessions.get(FOREIGN_SESSION_ID)!.revoked_at, null);
            assert.equal(fixture.sessions.get(EXPIRED_SESSION_ID)!.revoked_at, null);
            // No credential was touched: this is not a password change.
            assert.equal(fixture.tokenVersion, 0);
            assert.equal(fixture.credential?.password_hash, storedDigest(CURRENT_PASSWORD));
        });

        test('a restricted account cannot write, but can still read its devices', async () => {
            const fixture = new AccountSecurityFixture({ accountStatus: 'restricted' });
            const writes = [
                await changePassword(fixture, passwordBody()),
                await fixture.app.request(SESSIONS_URL, {
                    method: 'DELETE',
                    headers: bearerHeaders()
                }),
                await fixture.app.request(`${SESSIONS_URL}/${SECOND_DEVICE_SESSION_ID}`, {
                    method: 'DELETE',
                    headers: bearerHeaders()
                })
            ];
            for (const response of writes) {
                assert.equal(response.status, 403);
                assert.equal(
                    ((await response.json()) as ErrorBody).code,
                    'PLATFORM_ACCOUNT_RESTRICTED'
                );
            }
            assert.equal(fixture.tokenVersion, 0);
            assert.deepEqual(fixture.liveSessionIds().length, 3);

            // Seeing where you are signed in is how you work out why you were
            // restricted, so the read stays open.
            const listed = await listSessions(fixture);
            assert.equal(listed.status, 200);
            assert.equal(
                platformSessionListResponseSchema.parse(await listed.json()).sessions.length,
                3
            );
        });

        test('cookie callers must present a matching CSRF token', async () => {
            const fixture = new AccountSecurityFixture();
            const accepted = await changePassword(fixture, passwordBody(), cookieHeaders());
            assert.equal(accepted.status, 200);

            const replay = new AccountSecurityFixture();
            const rejected = await changePassword(
                replay,
                passwordBody(),
                cookieHeaders({ 'x-csrftoken': 'wrong-secret' })
            );
            assert.equal(rejected.status, 403);
            assert.equal(
                ((await rejected.json()) as ErrorBody).code,
                'PLATFORM_CSRF_INVALID'
            );
            assert.equal(replay.tokenVersion, 0);
        });

        test('the OAuth link list never exposes the third-party subject', async () => {
            const fixture = new AccountSecurityFixture({
                oauthLinks: ONE_ENABLED_ONE_DISABLED
            });
            const response = await listOAuthLinks(fixture);

            assert.equal(response.status, 200);
            const raw = await response.text();
            // provider_subject is the user's internal id at the third party. Assert
            // against the raw payload so a leak cannot hide behind a renamed field.
            for (const key of ['provider_subject', 'providerSubject', 'subject']) {
                assert.equal(raw.includes(key), false, `${key} leaked`);
            }
            // And the values themselves, so a projection that kept the data under an
            // innocent-looking name is caught too.
            for (const link of fixture.oauthLinks) {
                assert.equal(
                    raw.includes(link.provider_subject),
                    false,
                    'a provider subject value leaked'
                );
            }

            // The contract schema is strict, so any extra field fails here as well.
            const body = platformOAuthLinkListResponseSchema.parse(JSON.parse(raw));
            assert.deepEqual(
                body.links.map((entry) => entry.provider),
                [GOOGLE_PROVIDER, DISABLED_PROVIDER]
            );
            // Another account's link is none of this account's business.
            assert.equal(
                body.links.some((entry) => entry.provider === FOREIGN_PROVIDER),
                false
            );

            const google = body.links.find((e) => e.provider === GOOGLE_PROVIDER)!;
            assert.equal(google.providerName, 'Google');
            assert.equal(google.enabled, true);
            assert.equal(google.accountName, `${GOOGLE_PROVIDER} person`);
            assert.equal(google.avatarUrl, `https://cdn.example.test/${GOOGLE_PROVIDER}.png`);
            assert.equal(google.linkedAt, 3_000);

            const disabled = body.links.find((e) => e.provider === DISABLED_PROVIDER)!;
            assert.equal(disabled.providerName, 'Legacy SSO');
            assert.equal(disabled.enabled, false);
        });

        test('an empty provider string is reported as no value, not as a blank name', async () => {
            const fixture = new AccountSecurityFixture({
                oauthLinks: [
                    oauthLink(GOOGLE_PROVIDER, {
                        provider_display_name: '',
                        provider_avatar_url: ''
                    })
                ]
            });
            const response = await listOAuthLinks(fixture);

            assert.equal(response.status, 200);
            const body = platformOAuthLinkListResponseSchema.parse(await response.json());
            // Both columns are NOT NULL DEFAULT '', so the empty string is the storage
            // encoding for "the provider told us nothing".
            assert.equal(body.links[0]!.accountName, null);
            assert.equal(body.links[0]!.avatarUrl, null);
        });

        test('a password makes a sole OAuth link removable', async () => {
            const fixture = new AccountSecurityFixture();
            const listed = platformOAuthLinkListResponseSchema.parse(
                await (await listOAuthLinks(fixture)).json()
            );
            assert.deepEqual(listed.links.map((entry) => entry.removable), [true]);

            const response = await unlink(fixture, GOOGLE_PROVIDER);
            assert.equal(response.status, 200);
            assert.deepEqual(
                platformOAuthUnlinkResponseSchema.parse(await response.json()),
                { success: true, provider: GOOGLE_PROVIDER }
            );
            assert.deepEqual(fixture.linkedProviders(), []);
            // The unlink was audited against the right account and event type.
            assert.equal(fixture.unlinkInputs.length, 1);
            assert.equal(fixture.unlinkInputs[0]!.event.eventType, 'auth.oauth.unlinked');
            assert.equal(fixture.unlinkInputs[0]!.accountId, ACCOUNT_ID);
        });

        test('the link list reports whether a password exists at all', async () => {
            // An OAuth-only account has no password to change. Without this flag the
            // client can only find that out by submitting the form and reading 409,
            // so the answer travels with the login-method list.
            const withoutPassword = new AccountSecurityFixture({
                credential: null,
                oauthLinks: TWO_ENABLED_LINKS
            });
            assert.equal(
                platformOAuthLinkListResponseSchema.parse(
                    await (await listOAuthLinks(withoutPassword)).json()
                ).passwordEnabled,
                false
            );

            const withPassword = new AccountSecurityFixture({
                oauthLinks: TWO_ENABLED_LINKS
            });
            assert.equal(
                platformOAuthLinkListResponseSchema.parse(
                    await (await listOAuthLinks(withPassword)).json()
                ).passwordEnabled,
                true
            );
        });

        test('without a password, one of two enabled links can still go', async () => {
            const fixture = new AccountSecurityFixture({
                credential: null,
                oauthLinks: TWO_ENABLED_LINKS
            });
            const listed = platformOAuthLinkListResponseSchema.parse(
                await (await listOAuthLinks(fixture)).json()
            );
            assert.equal(listed.passwordEnabled, false);
            // Either one may go, because removing it leaves a usable sibling.
            assert.deepEqual(listed.links.map((entry) => entry.removable), [true, true]);

            const response = await unlink(fixture, GOOGLE_PROVIDER);
            assert.equal(response.status, 200);
            assert.deepEqual(fixture.linkedProviders(), [GITHUB_PROVIDER]);

            // The survivor is now the last way in, so it must refuse.
            const second = await unlink(fixture, GITHUB_PROVIDER);
            assert.equal(second.status, 409);
            assert.equal(
                ((await second.json()) as ErrorBody).code,
                'PLATFORM_OAUTH_LAST_LOGIN_METHOD'
            );
            assert.deepEqual(fixture.linkedProviders(), [GITHUB_PROVIDER]);
        });

        test('a disabled provider does not count as a surviving login method', async () => {
            const fixture = new AccountSecurityFixture({
                credential: null,
                oauthLinks: ONE_ENABLED_ONE_DISABLED
            });
            const listed = platformOAuthLinkListResponseSchema.parse(
                await (await listOAuthLinks(fixture)).json()
            );
            // The enabled link is the only one that can complete a sign-in, so it is
            // pinned; the disabled one is dead weight and may go.
            assert.deepEqual(
                listed.links.map((entry) => [entry.provider, entry.removable]),
                [[GOOGLE_PROVIDER, false], [DISABLED_PROVIDER, true]]
            );

            const response = await unlink(fixture, GOOGLE_PROVIDER);

            // The whole point of the guard: counting the disabled link as a survivor
            // would let the user keep only a provider that cannot sign them in, which
            // locks them out of the account permanently.
            assert.equal(response.status, 409);
            assert.equal(
                ((await response.json()) as ErrorBody).code,
                'PLATFORM_OAUTH_LAST_LOGIN_METHOD'
            );
            assert.deepEqual(
                fixture.linkedProviders(),
                [GOOGLE_PROVIDER, DISABLED_PROVIDER].sort()
            );

            // Dropping the unusable one is allowed and leaves the working one in place.
            const disabled = await unlink(fixture, DISABLED_PROVIDER);
            assert.equal(disabled.status, 200);
            assert.deepEqual(fixture.linkedProviders(), [GOOGLE_PROVIDER]);
        });

        test('a password-less account cannot unlink its only provider', async () => {
            const fixture = new AccountSecurityFixture({
                credential: null,
                oauthLinks: [oauthLink(GOOGLE_PROVIDER)]
            });
            const listed = platformOAuthLinkListResponseSchema.parse(
                await (await listOAuthLinks(fixture)).json()
            );
            assert.deepEqual(listed.links.map((entry) => entry.removable), [false]);

            const response = await unlink(fixture, GOOGLE_PROVIDER);
            assert.equal(response.status, 409);
            assert.equal(
                ((await response.json()) as ErrorBody).code,
                'PLATFORM_OAUTH_LAST_LOGIN_METHOD'
            );
            assert.deepEqual(fixture.linkedProviders(), [GOOGLE_PROVIDER]);
        });

        test('an unknown provider and another account\'s link are both just missing', async () => {
            const fixture = new AccountSecurityFixture();

            // The foreign account really does have this link; the caller does not.
            // Reporting it as anything but 404 would confirm that it exists elsewhere.
            const foreign = await unlink(fixture, FOREIGN_PROVIDER);
            assert.equal(foreign.status, 404);
            assert.equal(
                ((await foreign.json()) as ErrorBody).code,
                'PLATFORM_OAUTH_LINK_NOT_FOUND'
            );
            assert.deepEqual(fixture.linkedProviders(FOREIGN_ACCOUNT_ID), [FOREIGN_PROVIDER]);

            for (const provider of [
                GITHUB_PROVIDER,   // a real provider this account never linked
                'no-such-provider', // no such row at all
                'Google',           // wrong case: cannot match the column's CHECK
                '-leading-dash',
                'a'.repeat(40)      // longer than the 32-character bound
            ]) {
                const response = await unlink(fixture, provider);
                assert.equal(response.status, 404, `${provider} should be 404`);
                assert.equal(
                    ((await response.json()) as ErrorBody).code,
                    'PLATFORM_OAUTH_LINK_NOT_FOUND'
                );
            }
            // Nothing was removed along the way.
            assert.deepEqual(fixture.linkedProviders(), [GOOGLE_PROVIDER]);
            // The two malformed codes never reached the repository at all.
            assert.deepEqual(
                fixture.unlinkInputs.map((input) => input.providerCode),
                [FOREIGN_PROVIDER, GITHUB_PROVIDER, 'no-such-provider']
            );
        });

        test('anonymous and restricted callers cannot unlink', async () => {
            const anonymous = new AccountSecurityFixture();
            for (const response of [
                await anonymous.app.request(OAUTH_LINKS_URL),
                await anonymous.app.request(`${OAUTH_LINKS_URL}/${GOOGLE_PROVIDER}`, {
                    method: 'DELETE'
                })
            ]) {
                assert.equal(response.status, 401);
                assert.equal(
                    ((await response.json()) as ErrorBody).code,
                    'PLATFORM_SESSION_INVALID'
                );
            }
            assert.deepEqual(anonymous.linkedProviders(), [GOOGLE_PROVIDER]);

            const restricted = new AccountSecurityFixture({ accountStatus: 'restricted' });
            const write = await unlink(restricted, GOOGLE_PROVIDER);
            assert.equal(write.status, 403);
            assert.equal(
                ((await write.json()) as ErrorBody).code,
                'PLATFORM_ACCOUNT_RESTRICTED'
            );
            assert.deepEqual(restricted.linkedProviders(), [GOOGLE_PROVIDER]);
            assert.deepEqual(restricted.unlinkInputs, []);

            // Seeing how you can sign in stays readable, matching the device list.
            const listed = await listOAuthLinks(restricted);
            assert.equal(listed.status, 200);
            assert.equal(
                platformOAuthLinkListResponseSchema.parse(await listed.json()).links.length,
                1
            );
        });

        test('cookie callers must present a matching CSRF token to unlink', async () => {
            const fixture = new AccountSecurityFixture();
            const rejected = await unlink(
                fixture,
                GOOGLE_PROVIDER,
                cookieHeaders({ 'x-csrftoken': 'wrong-secret' })
            );
            assert.equal(rejected.status, 403);
            assert.equal(
                ((await rejected.json()) as ErrorBody).code,
                'PLATFORM_CSRF_INVALID'
            );
            assert.deepEqual(fixture.linkedProviders(), [GOOGLE_PROVIDER]);

            const accepted = await unlink(fixture, GOOGLE_PROVIDER, cookieHeaders());
            assert.equal(accepted.status, 200);
            assert.deepEqual(fixture.linkedProviders(), []);
        });

        test('the OAuth link endpoints carry their own rate limit buckets', async () => {
            const perIp = new AccountSecurityFixture();
            perIp.rateLimiter.deniedBuckets.add('platform-security-oauth-ip');
            const ipLimited = await unlink(perIp, GOOGLE_PROVIDER);
            assert.equal(ipLimited.status, 429);
            assert.equal(((await ipLimited.json()) as ErrorBody).error, 'Too many requests');
            assert.deepEqual(perIp.linkedProviders(), [GOOGLE_PROVIDER]);
            // The listing shares the same path-level budget.
            assert.equal((await listOAuthLinks(perIp)).status, 429);

            const perAccount = new AccountSecurityFixture();
            perAccount.rateLimiter.deniedBuckets.add('platform-security-oauth-account');
            const accountLimited = await unlink(perAccount, GOOGLE_PROVIDER);
            assert.equal(accountLimited.status, 429);
            assert.equal(
                ((await accountLimited.json()) as ErrorBody).code,
                'PLATFORM_RATE_LIMITED'
            );
            assert.deepEqual(perAccount.linkedProviders(), [GOOGLE_PROVIDER]);
            assert.deepEqual(
                perAccount.rateLimiter.calls.filter(
                    (call) => call.bucket === 'platform-security-oauth-account'
                ),
                [{
                    bucket: 'platform-security-oauth-account',
                    key: ACCOUNT_ID,
                    limit: 30
                }]
            );
        });

        test('account security endpoints carry their own rate limit buckets', async () => {
            const perIp = new AccountSecurityFixture();
            perIp.rateLimiter.deniedBuckets.add('platform-security-password-ip');
            const ipLimited = await changePassword(perIp, passwordBody());
            assert.equal(ipLimited.status, 429);
            assert.equal(((await ipLimited.json()) as ErrorBody).error, 'Too many requests');
            assert.equal(perIp.tokenVersion, 0);

            const perAccount = new AccountSecurityFixture();
            perAccount.rateLimiter.deniedBuckets.add('platform-security-password-account');
            const accountLimited = await changePassword(perAccount, passwordBody());
            assert.equal(accountLimited.status, 429);
            assert.equal(
                ((await accountLimited.json()) as ErrorBody).code,
                'PLATFORM_RATE_LIMITED'
            );
            assert.equal(perAccount.tokenVersion, 0);
            assert.deepEqual(
                perAccount.rateLimiter.calls.filter(
                    (call) => call.bucket === 'platform-security-password-account'
                ),
                [{
                    bucket: 'platform-security-password-account',
                    key: ACCOUNT_ID,
                    limit: 10
                }]
            );

            const sessionIp = new AccountSecurityFixture();
            sessionIp.rateLimiter.deniedBuckets.add('platform-security-session-ip');
            assert.equal((await listSessions(sessionIp)).status, 429);

            const sessionAccount = new AccountSecurityFixture();
            sessionAccount.rateLimiter.deniedBuckets.add('platform-security-session-account');
            const revokeLimited = await sessionAccount.app.request(SESSIONS_URL, {
                method: 'DELETE',
                headers: bearerHeaders()
            });
            assert.equal(revokeLimited.status, 429);
            assert.deepEqual(sessionAccount.liveSessionIds().length, 3);
        });
    });
}
