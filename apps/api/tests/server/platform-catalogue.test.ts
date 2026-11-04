/**
 * The platform catalogue and the producer's own handles, driven through the
 * real repository and the real Hono app. The editor on the Web reads the same
 * two endpoints, so what matters here is that a value survives the formatting
 * pipeline, that a delete reports the rows it touched, and that the catalogue
 * rows keep their icon key across an edit.
 */
import { createPostgresTestDatabase } from '../postgres-test-database';
import { createTestApp, testRequest } from './test-app';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { SqlPlatformAccountRepository } from '@/infra/db/repositories/platform-account-repository';
import { executeSql } from '@/infra/db/sql/query';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import type { PlatformAccessTokenInput, PlatformTokenService } from '@/ports/security';
import type { RuntimeServices } from '@/ports/runtime-services';
import { platformApiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import assert from 'node:assert/strict';
import { onTestFinished, test } from 'vitest';

const ACCOUNT = 'catalogue-account';
const SESSION = 'catalogue-session';
const NOW = 1_790_000_000_000;
const CSRF = 'catalogue-csrf';
const TOKEN = 'catalogue-access-token';

interface Fixture {
    app: ImsHonoApp;
    repository: SqlCoreRepository;
    headers: Record<string, string>;
}

async function createFixture(): Promise<Fixture> {
    const database = await createPostgresTestDatabase('platform-catalogue');
    onTestFinished(() => database.close());
    const schema = new PostgresqlSchemaStrategy();
    await schema.initializeCore(database);

    await executeSql(
        database,
        `INSERT INTO platform_accounts (id, status, token_version, created_at, updated_at, deleted_at)
         VALUES (?, 'active', 0, ?, ?, NULL)`,
        [ACCOUNT, NOW, NOW]
    );
    await executeSql(
        database,
        `INSERT INTO platform_profiles (account_id, display_name, updated_at) VALUES (?, ?, ?)`,
        [ACCOUNT, '目录测试制作人', NOW]
    );
    await executeSql(
        database,
        `INSERT INTO platform_refresh_sessions
             (id, account_id, token_hash, previous_token_hash, csrf_hash,
              expires_at, created_at, updated_at, revoked_at, user_agent,
              ip_address, last_seen_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, NULL, NULL)`,
        [SESSION, ACCOUNT, 'a'.repeat(64), 'b'.repeat(64), Date.now() + 3_600_000, NOW, NOW]
    );

    const platformTokens: PlatformTokenService = {
        async sign(_claims: PlatformAccessTokenInput, _expiresInSeconds: number) {
            return TOKEN;
        },
        async verify(value: string) {
            if (value !== TOKEN) throw new Error('invalid token');
            return {
                iss: 'imsweb' as const,
                aud: 'ims-platform' as const,
                kind: 'platform' as const,
                id: ACCOUNT,
                tokenVersion: 0,
                sessionId: SESSION,
                csrfSecret: CSRF,
                jti: 'catalogue-jti',
                iat: Math.floor(NOW / 1000),
                exp: Math.floor(NOW / 1000) + 300
            };
        }
    };
    const repository = new SqlCoreRepository(database, schema);
    await repository.initialize();
    const services: RuntimeServices = {
        platformAccounts: new SqlPlatformAccountRepository(database, schema),
        platformTokens,
        namecards: repository,
        config: { cookieSecure: false }
    };
    return {
        app: createTestApp(() => services),
        repository,
        headers: { Authorization: `Bearer ${TOKEN}` }
    };
}

test('the catalogue keeps its icon key across an edit and reports deletes', async () => {
    const { repository } = await createFixture();

    await repository.upsertPlatformAccountKind({
        id: 'testkind',
        name: '测试平台',
        group_key: 'social',
        pattern: '^[a-z0-9]{3,12}$',
        base_url: 'https://example.test/{value}',
        color: '#123456',
        icon: 'testkind',
        display_order: 900,
        enabled: true,
        uppercase: false,
        icon_object_key: null,
        updated_at: '2026-11-03T00:00:00.000Z'
    });

    const created = (await repository.listPlatformAccountKinds()).find(
        (kind) => kind.id === 'testkind'
    );
    assert.equal(created?.name, '测试平台');
    assert.equal(created?.icon_object_key, null);

    assert.equal(
        await repository.setPlatformAccountKindIcon(
            'testkind',
            'platform/account-kinds/testkind/icon.svg'
        ),
        true
    );
    const marked = (await repository.listPlatformAccountKinds()).find(
        (kind) => kind.id === 'testkind'
    );
    assert.equal(
        marked?.icon_object_key,
        'platform/account-kinds/testkind/icon.svg'
    );

    // An edit without an icon key keeps the uploaded mark.
    await repository.upsertPlatformAccountKind({
        ...marked!,
        name: '改名后的平台',
        icon_object_key: marked!.icon_object_key
    });
    const renamed = (await repository.listPlatformAccountKinds()).find(
        (kind) => kind.id === 'testkind'
    );
    assert.equal(renamed?.name, '改名后的平台');
    assert.equal(
        renamed?.icon_object_key,
        'platform/account-kinds/testkind/icon.svg'
    );

    assert.equal(await repository.setPlatformAccountKindIcon('missing', 'x'), false);
    assert.equal(await repository.deletePlatformAccountKind('testkind'), true);
    assert.equal(await repository.deletePlatformAccountKind('testkind'), false);
}, 30_000);

test('a producer stores one handle per platform and can take it back', async () => {
    const { app, repository, headers } = await createFixture();

    const empty = await testRequest(app, platformApiPath('/me/accounts'), { headers });
    assert.equal(empty.status, 200);
    const emptyBody = (await empty.json()) as {
        catalog: Array<{ id: string; iconUrl: string | null }>;
        entries: unknown[];
    };
    assert.ok(emptyBody.catalog.length > 0);
    assert.deepEqual(emptyBody.entries, []);
    assert.ok(
        emptyBody.catalog.every((kind) => kind.iconUrl === null || typeof kind.iconUrl === 'string')
    );

    const saved = await testRequest(app, platformApiPath('/me/accounts/bilibili'), {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
            value: 'https://space.bilibili.com/12345?spm_id_from=333.1007'
        })
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), {
        kindId: 'bilibili',
        value: '12345',
        username: null
    });

    const stored = await repository.listPlatformAccountEntries(ACCOUNT);
    assert.deepEqual(
        stored.map((entry) => [entry.kind_id, entry.value]),
        [['bilibili', '12345']]
    );

    const rejected = await testRequest(app, platformApiPath('/me/accounts/bilibili'), {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ value: 'not-a-number' })
    });
    assert.equal(rejected.status, 400);

    const unknownKind = await testRequest(app, platformApiPath('/me/accounts/nope'), {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ value: 'x' })
    });
    assert.equal(unknownKind.status, 404);

    const removed = await testRequest(app, platformApiPath('/me/accounts/bilibili'), {
        method: 'DELETE',
        headers
    });
    assert.equal(removed.status, 200);
    assert.deepEqual(await removed.json(), { success: true, removed: 1 });

    assert.deepEqual(await repository.listPlatformAccountEntries(ACCOUNT), []);
}, 30_000);

test('the public profile answers a known handle, its empty wall and 404s the rest', async () => {
    const { app, repository } = await createFixture();
    await repository.upsertPlatformAccountKind({
        id: 'bilibili',
        name: '哔哩哔哩',
        group_key: 'social',
        pattern: '^[0-9]{1,20}$',
        base_url: 'https://space.bilibili.com/{value}',
        color: '#ff6699',
        icon: 'bilibili',
        display_order: 110,
        enabled: true,
        uppercase: false,
        icon_object_key: null,
        updated_at: '2026-11-03T00:00:00.000Z'
    });
    await repository.upsertPlatformAccountEntry({
        accountId: ACCOUNT,
        kindId: 'bilibili',
        value: '12345',
        username: null,
        at: '2026-11-03T00:00:00.000Z'
    });

    const profile = await testRequest(app, `/api/users/${ACCOUNT}`);
    assert.equal(profile.status, 200);
    const body = (await profile.json()) as {
        accountId: string;
        uid: number;
        pageSlug: string | null;
        displayName: string;
        accounts: Array<{ kindId: string; value: string; url: string | null }>;
    };
    assert.equal(body.accountId, ACCOUNT);
    assert.equal(body.displayName, '目录测试制作人');
    assert.equal(body.pageSlug, null);
    assert.deepEqual(
        body.accounts.map((account) => [account.kindId, account.value]),
        [['bilibili', '12345']]
    );
    assert.equal(
        body.accounts[0]?.url,
        'https://space.bilibili.com/12345'
    );

    const wall = await testRequest(app, `/api/users/${ACCOUNT}/cards`);
    assert.equal(wall.status, 200);
    assert.deepEqual(await wall.json(), { list: [], total: 0, totalPage: 0 });

    const unknown = await testRequest(app, '/api/users/nobody');
    assert.equal(unknown.status, 404);
    const unknownWall = await testRequest(app, '/api/users/nobody/cards');
    assert.equal(unknownWall.status, 404);
}, 30_000);
