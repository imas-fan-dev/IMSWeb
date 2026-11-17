/**
 * The five backoffice station-message routes, driven through the real Hono app
 * and a real database: the contract validators, the domain normalizers, the
 * repository and the audit row all have to line up, and the handler stubs in
 * the route-inventory suites would not notice a broken SQL statement.
 */
import { insertUser } from '../fixtures/rows';
import { createPostgresTestDatabase } from '../postgres-test-database';
import { createTestApp, testRequest } from './test-app';
import { SqlAuditRepository } from '@/infra/db/repositories/audit-repository';
import { SqlBackofficeAuthRepository } from '@/infra/db/repositories/backoffice-auth-repository';
import { SqlStationMessageRepository } from '@/infra/db/repositories/station-message-repository';
import { executeSql, queryAll } from '@/infra/db/sql/query';
import type { PostgresConnection } from '@/infra/db/postgresql/connection';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { HmacBackofficeTokenService } from '@/infra/security/hmac/token-service';
import type { RuntimeServices } from '@/ports/runtime-services';
import { adminApiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import assert from 'node:assert/strict';
import { onTestFinished, test } from 'vitest';

const SECRET = 'station-message-tests-secret-value-32-bytes';
const MESSAGES = adminApiPath('/platform/messages');
const CREATED_AT = 1_790_000_000_000;

interface Fixture {
    app: ImsHonoApp;
    connection: PostgresConnection;
    headers: Record<string, string>;
}

async function seedAccount(
    connection: PostgresConnection,
    id: string,
    displayName: string,
    email: string | null
): Promise<void> {
    await executeSql(
        connection,
        `INSERT INTO platform_accounts (id, status, token_version, created_at, updated_at, deleted_at)
         VALUES (?, 'active', 0, ?, ?, NULL)`,
        [id, CREATED_AT, CREATED_AT]
    );
    await executeSql(
        connection,
        `INSERT INTO platform_profiles (account_id, display_name, updated_at) VALUES (?, ?, ?)`,
        [id, displayName, CREATED_AT]
    );
    if (email) {
        await executeSql(
            connection,
            `INSERT INTO platform_email_credentials
                 (normalized_email, account_id, algorithm, parameters_json, salt, password_hash,
                  created_at, updated_at)
             VALUES (?, ?, 'bcrypt', '{}', NULL, '$2b$04$hash', ?, ?)`,
            [email, id, CREATED_AT, CREATED_AT]
        );
    }
}

async function createFixture(): Promise<Fixture> {
    const connection = await createPostgresTestDatabase('station-messages-admin');
    onTestFinished(() => connection.close());
    await new PostgresqlSchemaStrategy().initializeCore(connection);
    const operatorId = await insertUser(connection, 'station-operator', {
        password: 'stored-digest',
        dept: 'op',
        producername: 'Station Operator',
        admin_role: 'super_admin'
    });
    const tokens = new HmacBackofficeTokenService(SECRET);
    const services: RuntimeServices = {
        backofficeAuth: new SqlBackofficeAuthRepository(connection),
        stationMessages: new SqlStationMessageRepository(connection),
        audit: new SqlAuditRepository(connection),
        backofficeTokens: tokens,
        config: { cookieSecure: false, fudabaPublicReadEnabled: true }
    };
    const csrf = 'csrf-station-operator';
    const token = await tokens.sign(
        {
            id: operatorId,
            username: 'station-operator',
            producername: 'Station Operator',
            dept: 'op',
            adminRole: 'super_admin',
            csrfSecret: csrf
        },
        3_600
    );
    return {
        app: createTestApp(() => services),
        connection,
        headers: {
            Cookie: `token=${token}; csrf_token=${csrf}`,
            'X-CSRFToken': csrf,
            'Content-Type': 'application/json'
        }
    };
}

function sendBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        title: '维护通知',
        body: '今晚 23:00 停机维护。',
        audience: 'selected',
        accountIds: ['acct-a'],
        forwardEmail: true,
        scheduledAt: null,
        ...overrides
    };
}

test('sends an immediate batch and records the audit trail', async () => {
    const { app, connection, headers } = await createFixture();
    await seedAccount(connection, 'acct-a', '调试用户 A', 'a@example.com');

    const response = await testRequest(app, MESSAGES, {
        method: 'POST',
        headers,
        body: JSON.stringify(sendBody())
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
        success: boolean;
        message: { id: string; status: string; deliveredCount: number; recipientCount: number };
    };
    assert.equal(body.success, true);
    assert.equal(body.message.status, 'sent');
    assert.equal(body.message.recipientCount, 1);
    assert.equal(body.message.deliveredCount, 1);

    const audits = await queryAll<{ action: string; target: string }>(
        connection,
        `SELECT action, target FROM logs WHERE action LIKE '%通知%' ORDER BY id`
    );
    assert.deepEqual(audits.map((row) => row.action), ['发送通知']);
    assert.match(audits[0].target, new RegExp(body.message.id));
});

test('schedules a batch and cancels it again', async () => {
    const { app, connection, headers } = await createFixture();
    await seedAccount(connection, 'acct-a', '调试用户 A', 'a@example.com');

    const created = await testRequest(app, MESSAGES, {
        method: 'POST',
        headers,
        body: JSON.stringify(sendBody({ scheduledAt: Date.now() + 120_000 }))
    });
    assert.equal(created.status, 200);
    const { message } = (await created.json()) as { message: { id: string; status: string } };
    assert.equal(message.status, 'scheduled');

    const audits = await queryAll<{ action: string }>(
        connection,
        `SELECT action FROM logs WHERE action LIKE '%通知%' ORDER BY id`
    );
    assert.deepEqual(audits.map((row) => row.action), ['定时发送通知']);

    const canceled = await testRequest(app, `${MESSAGES}/${message.id}/cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
    });
    assert.equal(canceled.status, 200);
    const canceledBody = (await canceled.json()) as { message: { status: string } };
    assert.equal(canceledBody.message.status, 'canceled');

    const again = await testRequest(app, `${MESSAGES}/${message.id}/cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
    });
    assert.equal(again.status, 409);
    const conflict = (await again.json()) as { success: boolean; code: string };
    assert.equal(conflict.success, false);
    assert.equal(conflict.code, 'STATION_MESSAGE_NOT_CANCELABLE');

    const missing = await testRequest(
        app,
        `${MESSAGES}/00000000-0000-0000-0000-000000000000/cancel`,
        { method: 'POST', headers, body: JSON.stringify({}) }
    );
    assert.equal(missing.status, 404);
});

test('rejects a selected batch without recipients', async () => {
    const { app, headers } = await createFixture();
    const response = await testRequest(app, MESSAGES, {
        method: 'POST',
        headers,
        body: JSON.stringify(sendBody({ accountIds: [] }))
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { success: boolean; code: string };
    assert.equal(body.code, 'STATION_MESSAGE_RECIPIENTS_REQUIRED');
});

test('lists the ledger and the recipient pool', async () => {
    const { app, connection, headers } = await createFixture();
    await seedAccount(connection, 'acct-a', '调试用户 A', 'a@example.com');
    await seedAccount(connection, 'acct-b', '另一个人', 'b@example.com');

    await testRequest(app, MESSAGES, {
        method: 'POST',
        headers,
        body: JSON.stringify(sendBody())
    });

    const list = await testRequest(app, `${MESSAGES}?page=1&pageSize=10`, { headers });
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as {
        success: boolean;
        messages: Array<{ title: string }>;
        pageInfo: { total: number; page: number };
    };
    assert.equal(listBody.messages.length, 1);
    assert.equal(listBody.messages[0].title, '维护通知');
    assert.equal(listBody.pageInfo.total, 1);
    assert.equal(listBody.pageInfo.page, 1);

    const pool = await testRequest(app, `${MESSAGES}/recipients?query=%E5%8F%A6`, { headers });
    assert.equal(pool.status, 200);
    const poolBody = (await pool.json()) as {
        targets: Array<{ accountId: string; displayName: string }>;
        pageInfo: { total: number };
    };
    assert.deepEqual(poolBody.targets.map((target) => target.accountId), ['acct-b']);
    assert.equal(poolBody.pageInfo.total, 1);
});

test('lists the recipients of one batch and answers 404 for the others', async () => {
    const { app, connection, headers } = await createFixture();
    await seedAccount(connection, 'acct-a', '调试用户 A', 'a@example.com');

    const created = await testRequest(app, MESSAGES, {
        method: 'POST',
        headers,
        body: JSON.stringify(sendBody())
    });
    const { message } = (await created.json()) as { message: { id: string } };

    const deliveries = await testRequest(app, `${MESSAGES}/${message.id}/recipients`, { headers });
    assert.equal(deliveries.status, 200);
    const body = (await deliveries.json()) as {
        deliveries: Array<{ accountId: string; delivered: boolean; emailState: string }>;
    };
    assert.deepEqual(
        body.deliveries.map((entry) => ({
            accountId: entry.accountId,
            delivered: entry.delivered,
            emailState: entry.emailState
        })),
        [{ accountId: 'acct-a', delivered: true, emailState: 'pending' }]
    );

    const missing = await testRequest(
        app,
        `${MESSAGES}/00000000-0000-0000-0000-000000000000/recipients`,
        { headers }
    );
    assert.equal(missing.status, 404);
    const missingBody = (await missing.json()) as { code: string };
    assert.equal(missingBody.code, 'STATION_MESSAGE_NOT_FOUND');
});
