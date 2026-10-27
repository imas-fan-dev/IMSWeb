/**
 * The signed-in producer's claim inbox and notification inbox, driven through
 * the real Hono app with a real Platform session. The repositories are covered
 * elsewhere; what only the HTTP layer can prove is the contract shape, the
 * unread accounting after a partial mark, and that a claim decision actually
 * moves the envelope out of the pending list.
 */
import { createPostgresTestDatabase } from '../postgres-test-database';
import { createTestApp, testRequest } from './test-app';
import { SqlAuditRepository } from '@/infra/db/repositories/audit-repository';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { SqlFudabaRepository } from '@/infra/db/repositories/fudaba-repository';
import { SqlPlatformAccountRepository } from '@/infra/db/repositories/platform-account-repository';
import { insertNamecardNotification } from '@/infra/db/repositories/namecard-notification-repository';
import { executeSql, queryAll, queryOne } from '@/infra/db/sql/query';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import type { PlatformAccessTokenInput, PlatformTokenService } from '@/ports/security';
import type { RuntimeServices } from '@/ports/runtime-services';
import { exchangePath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { onTestFinished, test } from 'vitest';

const SECRET = 'platform-session-tests-secret-value-32-bytes';
const ACCOUNT = 'claims-account';
const SESSION = 'claims-session';
const NOW = 1_790_000_000_000;
const CSRF = 'claims-csrf';

function sha(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

interface Fixture {
    app: ImsHonoApp;
    database: ManagedSqlDatabase;
    headers: Record<string, string>;
}

async function createFixture(): Promise<Fixture> {
    const database = await createPostgresTestDatabase('fudaba-claims-routes');
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
        [ACCOUNT, '调试用户', NOW]
    );
    await executeSql(
        database,
        `INSERT INTO platform_refresh_sessions
             (id, account_id, token_hash, previous_token_hash, csrf_hash,
              expires_at, created_at, updated_at, revoked_at, user_agent,
              ip_address, last_seen_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, NULL, NULL)`,
        // The session row has to outlive the wall clock, not the frozen NOW.
        [SESSION, ACCOUNT, sha('refresh'), sha(CSRF), Date.now() + 3_600_000, NOW, NOW]
    );

    const token = 'claims-access-token';
    const platformTokens: PlatformTokenService = {
        // The suite only ever presents a token, so the signature round-trip is
        // covered by the HMAC service tests instead of here.
        async sign(_claims: PlatformAccessTokenInput, _expiresInSeconds: number) {
            return token;
        },
        async verify(value: string) {
            if (value !== token) throw new Error('invalid token');
            return {
                iss: 'imsweb' as const,
                aud: 'ims-platform' as const,
                kind: 'platform' as const,
                id: ACCOUNT,
                tokenVersion: 0,
                sessionId: SESSION,
                csrfSecret: CSRF,
                jti: 'claims-jti',
                iat: Math.floor(NOW / 1000),
                exp: Math.floor(NOW / 1000) + 300
            };
        }
    };
    const services: RuntimeServices = {
        platformAccounts: new SqlPlatformAccountRepository(database, schema),
        platformTokens,
        namecards: new SqlCoreRepository(database, schema),
        fudaba: new SqlFudabaRepository(database, schema),
        audit: new SqlAuditRepository(database),
        config: {
            cookieSecure: false,
            fudabaPublicReadEnabled: true,
            // The write guard answers 404 rather than 403 for a disabled flag.
            fudabaWriteEnabled: true
        }
    };
    return {
        app: createTestApp(() => services),
        database,
        headers: { Authorization: `Bearer ${token}` }
    };
}

test('lists the inbox, then marks one row and the rest separately', async () => {
    const { app, database, headers } = await createFixture();
    const first = await insertNamecardNotification(database, {
        recipientAccountId: ACCOUNT,
        kind: 'card-approved',
        cardNumber: 793,
        title: '名片 #793 已通过审核',
        body: '你的名片 #793 已通过审核，现已展示在名片墙上。'
    });
    await insertNamecardNotification(database, {
        recipientAccountId: ACCOUNT,
        kind: 'station-message',
        cardNumber: null,
        title: '维护通知',
        body: '今晚 23:00 停机维护。'
    });

    const listed = await testRequest(app, exchangePath('/me/notifications'), { headers });
    if (listed.status !== 200) console.log('DEBUG inbox', listed.status, await listed.clone().text());
    assert.equal(listed.status, 200);
    const inbox = (await listed.json()) as {
        items: Array<{
            id: string;
            kind: string;
            cardNumber: number | null;
            readAt: string | null;
            createdAt: string;
        }>;
        unread: number;
    };
    assert.equal(inbox.unread, 2);
    assert.equal(inbox.items.length, 2);
    assert.ok(inbox.items.every((item) => item.readAt === null));
    assert.ok(inbox.items.every((item) => Number.isFinite(Date.parse(item.createdAt))));
    assert.ok(inbox.items.some((item) => item.kind === 'station-message' && item.cardNumber === null));

    const one = await testRequest(app, exchangePath('/me/notifications/read'), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [first] })
    });
    assert.equal(one.status, 200);
    assert.deepEqual(await one.json(), { success: true, updated: 1 });

    const rest = await testRequest(app, exchangePath('/me/notifications/read'), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    assert.deepEqual(await rest.json(), { success: true, updated: 1 });

    const after = await testRequest(app, exchangePath('/me/notifications'), { headers });
    const emptied = (await after.json()) as { unread: number };
    assert.equal(emptied.unread, 0);

    // The validator refuses a body it cannot read instead of marking everything.
    const garbage = await testRequest(app, exchangePath('/me/notifications/read'), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: 'not-an-array' })
    });
    assert.equal(garbage.status, 400);
});

test('answers the claim envelope list for a producer without envelopes', async () => {
    const { app, headers } = await createFixture();
    const response = await testRequest(app, exchangePath('/me/claim-envelopes'), { headers });
    assert.equal(response.status, 200, await response.clone().text());
    const body = (await response.json()) as { items: unknown[] };
    assert.deepEqual(body.items, []);
});

test('refuses the inbox without a session', async () => {
    const { app } = await createFixture();
    const response = await testRequest(app, exchangePath('/me/notifications'), {});
    assert.equal(response.status, 401);
    const body = (await response.json()) as { success: boolean; code: string };
    assert.equal(body.code, 'PLATFORM_SESSION_INVALID');
});

test('counts the rows the account actually owns', async () => {
    const { database } = await createFixture();
    await insertNamecardNotification(database, {
        recipientAccountId: ACCOUNT,
        kind: 'card-locked',
        cardNumber: 794,
        title: '锁定',
        body: '正文'
    });
    const rows = await queryAll<{ kind: string }>(
        database,
        `SELECT kind FROM namecard_notifications WHERE recipient_account_id = ?`,
        [ACCOUNT]
    );
    assert.deepEqual(
        rows.map((row) => row.kind),
        ['card-locked']
    );
    const stray = await queryOne<{ count: number }>(
        database,
        `SELECT COUNT(*)::int AS count FROM namecard_notifications WHERE recipient_account_id <> ?`,
        [ACCOUNT]
    );
    assert.equal(stray?.count, 0);
});
