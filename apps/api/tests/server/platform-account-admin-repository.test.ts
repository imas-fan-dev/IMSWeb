import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { TestContext } from 'node:test';
import { postgresTest as test } from '../integration/postgres-harness';
import { SqlPlatformAccountRepository } from '@/infra/db/repositories/platform-account-repository';
import type { SqlSchemaStrategy } from '@/infra/db/sql/database';
import type {
    NewPlatformEmailAccountInput,
    NewPlatformOAuthAccountInput,
    PlatformSecurityEventInput
} from '@/ports/repositories';
import type { PlatformOAuthProviderCode } from '@/ports/oauth';
import { createPostgresTestHarness } from '../integration/postgres-harness';

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

async function createFixture(t: TestContext) {
    const harness = await createPostgresTestHarness();
    const platform = new SqlPlatformAccountRepository(
        harness.connection,
        initializedPostgresSchema
    );
    t.after(() => harness.close());
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

test('admin list searches by id, email and display name and hides deleted accounts', async (t) => {
    const fixture = await createFixture(t);
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

test('admin list counts only live refresh sessions and reports them without leaking hashes', async (t) => {
    const fixture = await createFixture(t);
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

test('suspending bumps token_version, sweeps live sessions and is not affected by a lost race', async (t) => {
    const fixture = await createFixture(t);
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

test('a stale status write reports a conflict and leaves sessions alone', async (t) => {
    const fixture = await createFixture(t);
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

test('activating a restricted account is unsupported and unknown ids are not-found', async (t) => {
    const fixture = await createFixture(t);
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

test('force logout revokes every live session, bumps the version and is idempotent', async (t) => {
    const fixture = await createFixture(t);
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

test('the last-credential guard still refuses unlinking an OAuth-only account', async (t) => {
    const fixture = await createFixture(t);
    await fixture.platform.createOAuthAccount(oauthAccount('oauth-only', 'github'));

    const refused = await fixture.platform.deleteOAuthIdentity({
        accountId: 'oauth-only',
        providerCode: 'github',
        event: event('oauth-only', 'auth.oauth.unlinked')()
    });
    assert.equal(refused.status, 'last-login-method');
});
