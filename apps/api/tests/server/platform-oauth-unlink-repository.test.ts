import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
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

async function createFixture(t: TestContext): Promise<{
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
    t.after(() => harness.close());
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

test('a disabled provider does not count as a surviving login method', async (t) => {
    const fixture = await createFixture(t);
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

test('an enabled sibling link lets the other one go', async (t) => {
    const fixture = await createFixture(t);
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

test('a password is a login method, so the only link can be unlinked', async (t) => {
    const fixture = await createFixture(t);
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

test('the sole link of a password-less account survives its own removal', async (t) => {
    const fixture = await createFixture(t);
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

test('another account link is never reachable', async (t) => {
    const fixture = await createFixture(t);
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
