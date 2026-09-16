import { postgresTest as test } from './postgres-test-database';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import {
    adminAccountErrorResponseSchema,
    adminAccountListSchema,
    adminAccountMutationSchema,
    adminAuditLogListSchema,
    adminLogoutSuccessResponseSchema
} from '@imsweb/contracts/admin';
import { insertFudabaOfficePublicLocation, insertPlatformAccount, insertUser } from '../fixtures/rows';
import { SqlAdminAccountRepository } from '@/infra/db/repositories/admin-account-repository';
import { SqlAuditRepository } from '@/infra/db/repositories/audit-repository';
import { SqlBackofficeAuthRepository } from '@/infra/db/repositories/backoffice-auth-repository';
import { PostgresConnection } from '@/infra/db/postgresql/connection';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { HmacBackofficeTokenService } from '@/infra/security/hmac/token-service';
import type { AdminRole } from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';
import { createPostgresTestDatabase } from './postgres-test-database';
import { createTestApp, testRequest } from './test-app';

const SECRET = 'admin-accounts-contract-secret-at-least-thirty-two-bytes';

interface Fixture {
    app: ReturnType<typeof createTestApp>;
    connection: PostgresConnection;
    repository: SqlBackofficeAuthRepository;
    audit: SqlAuditRepository;
    tokens: HmacBackofficeTokenService;
    ids: { superAdmin: number; admin: number; editor: number };
    close(): Promise<void>;
}

async function insertAccount(
    connection: PostgresConnection,
    username: string,
    dept: 'op' | 'editor',
    role: AdminRole | null
): Promise<number> {
    return insertUser(connection, username, {
        password: 'stored-digest',
        dept,
        producername: `${username} P`,
        admin_role: role
    });
}

async function createFixture(t: TestContext): Promise<Fixture> {
    const connection = await createPostgresTestDatabase(t, 'admin-accounts');
    await new PostgresqlSchemaStrategy().initializeCore(connection);
    const repository = new SqlBackofficeAuthRepository(connection);
    const adminAccounts = new SqlAdminAccountRepository(connection);
    const audit = new SqlAuditRepository(connection);
    const ids = {
        superAdmin: await insertAccount(connection, 'super-operator', 'op', 'super_admin'),
        admin: await insertAccount(connection, 'regular-operator', 'op', 'admin'),
        editor: await insertAccount(connection, 'wiki-editor', 'editor', null)
    };
    const tokens = new HmacBackofficeTokenService(SECRET);
    const services: RuntimeServices = {
        backofficeAuth: repository,
        adminAccounts,
        audit,
        passwords: {
            async verify() { return false; },
            async hash(value) { return `hashed:${value}`; }
        },
        backofficeTokens: tokens,
        config: { cookieSecure: false }
    };
    return {
        app: createTestApp(() => services),
        connection,
        repository,
        audit,
        tokens,
        ids,
        async close() {
            await connection.close();
        }
    };
}

async function authHeaders(
    fixture: Fixture,
    input: { id: number; username: string; dept: string; role: AdminRole | null }
): Promise<Record<string, string>> {
    const csrf = `csrf-${input.username}`;
    const token = await fixture.tokens.sign({
        id: input.id,
        username: input.username,
        producername: `${input.username} P`,
        dept: input.dept,
        adminRole: input.role,
        csrfSecret: csrf
    }, 3600);
    return {
        Cookie: `token=${token}; csrf_token=${csrf}`,
        'X-CSRFToken': csrf
    };
}

test('only the super administrator can list op accounts', async (t) => {
    const fixture = await createFixture(t);
    t.after(() => fixture.close());

    const regular = await testRequest(fixture.app, '/api/admin/accounts', {
        headers: await authHeaders(fixture, {
            id: fixture.ids.admin,
            username: 'regular-operator',
            dept: 'op',
            role: 'admin'
        })
    });
    assert.equal(regular.status, 403);

    const editor = await testRequest(fixture.app, '/api/admin/accounts', {
        headers: await authHeaders(fixture, {
            id: fixture.ids.editor,
            username: 'wiki-editor',
            dept: 'editor',
            role: null
        })
    });
    assert.equal(editor.status, 403);

    const response = await testRequest(fixture.app, '/api/admin/accounts', {
        headers: await authHeaders(fixture, {
            id: fixture.ids.superAdmin,
            username: 'super-operator',
            dept: 'op',
            role: 'super_admin'
        })
    });
    assert.equal(response.status, 200);
    const body = await response.json() as {
        accounts: Array<{ username: string; adminRole: AdminRole }>;
    };
    assert.deepEqual(adminAccountListSchema.parse(body), body);
    assert.deepEqual(body.accounts.map((account) => account.username), [
        'super-operator',
        'regular-operator'
    ]);
    assert.deepEqual(body.accounts.map((account) => account.adminRole), [
        'super_admin',
        'admin'
    ]);
});

test('audit logs use the shared response contract', async (t) => {
    const fixture = await createFixture(t);
    t.after(() => fixture.close());
    const response = await testRequest(fixture.app, '/api/admin/logs', {
        headers: await authHeaders(fixture, {
            id: fixture.ids.superAdmin,
            username: 'super-operator',
            dept: 'op',
            role: 'super_admin'
        })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(adminAuditLogListSchema.parse(body), body);
});

test('super administrator creates only regular op accounts and audits the mutation', async (t) => {
    const fixture = await createFixture(t);
    t.after(() => fixture.close());
    const headers = await authHeaders(fixture, {
        id: fixture.ids.superAdmin,
        username: 'super-operator',
        dept: 'op',
        role: 'super_admin'
    });
    const response = await testRequest(fixture.app, '/api/admin/accounts', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: 'new-operator',
            producername: 'New Operator P',
            password: 'secure-password-123',
            adminRole: 'super_admin'
        })
    });
    assert.equal(response.status, 201);
    const responseBody = await response.json() as { account: { adminRole: AdminRole } };
    assert.deepEqual(adminAccountMutationSchema.parse(responseBody), responseBody);
    assert.equal(responseBody.account.adminRole, 'admin');
    const created = await fixture.repository.findUserByUsername('new-operator');
    assert.ok(created);
    assert.equal(created.dept, 'op');
    assert.equal(created.admin_role, 'admin');
    assert.equal(created.password, 'hashed:secure-password-123');

    const invalid = await testRequest(fixture.app, '/api/admin/accounts', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: 12,
            producername: 'Invalid Operator P',
            password: 'secure-password-123'
        })
    });
    assert.equal(invalid.status, 400);
    const invalidBody = await invalid.json();
    assert.deepEqual(adminAccountErrorResponseSchema.parse(invalidBody), invalidBody);
    assert.deepEqual(invalidBody, {
        success: false,
        message: '用户名、制作人名称或密码不符合要求'
    });

    const duplicate = await testRequest(fixture.app, '/api/admin/accounts', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: 'new-operator',
            producername: 'Duplicate P',
            password: 'another-password-123'
        })
    });
    assert.equal(duplicate.status, 409);

    const logs = await fixture.audit.listRecentAuditLogs(10);
    assert.equal(logs[0]?.action, '新增管理员');
    assert.equal(logs[0]?.target, 'new-operator');
});

test('super administrator deletes a regular op and revokes its refresh sessions', async (t) => {
    const fixture = await createFixture(t);
    t.after(() => fixture.close());
    await fixture.repository.createRefreshSession({
        id: 'regular-session',
        accountId: fixture.ids.admin,
        tokenHash: 'a'.repeat(64),
        csrfHash: 'b'.repeat(64),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        createdAt: Math.floor(Date.now() / 1000)
    });
    const headers = await authHeaders(fixture, {
        id: fixture.ids.superAdmin,
        username: 'super-operator',
        dept: 'op',
        role: 'super_admin'
    });
    const removeEditor = await testRequest(
        fixture.app,
        `/api/admin/accounts/${fixture.ids.editor}`,
        { method: 'DELETE', headers }
    );
    assert.equal(removeEditor.status, 404);
    const removeEditorBody = await removeEditor.json();
    assert.deepEqual(adminAccountErrorResponseSchema.parse(removeEditorBody), removeEditorBody);

    const removeSelf = await testRequest(
        fixture.app,
        `/api/admin/accounts/${fixture.ids.superAdmin}`,
        { method: 'DELETE', headers }
    );
    assert.equal(removeSelf.status, 409);

    const removed = await testRequest(
        fixture.app,
        `/api/admin/accounts/${fixture.ids.admin}`,
        { method: 'DELETE', headers }
    );
    assert.equal(removed.status, 200);
    const removedBody = await removed.json();
    assert.deepEqual(adminLogoutSuccessResponseSchema.parse(removedBody), removedBody);
    assert.equal(await fixture.repository.findUserById(fixture.ids.admin), null);
    assert.equal(
        await fixture.repository.findRefreshSessionByTokenHash('a'.repeat(64)),
        null
    );
});
test('administrator deletion preserves resolved Fudaba moderation actors', async (t) => {
    const fixture = await createFixture(t);
    t.after(() => fixture.close());
    const createdAt = '2026-08-02T00:00:00.000Z';
    await fixture.connection.prepare(
        `INSERT INTO fudaba_moderation_cases
            (id, resource_kind, resource_id, reporter_account_id, reason,
             details, state, backoffice_actor_id, resolution, created_at,
             updated_at, resolved_at)
         VALUES ('retained-actor-case', 'office', 'office-1', NULL,
                 'Policy review', '', 'resolved', ?, 'Retained', ?, ?, ?)`
    ).bind(
        fixture.ids.admin,
        createdAt,
        createdAt,
        createdAt
    ).run();
    const headers = await authHeaders(fixture, {
        id: fixture.ids.superAdmin,
        username: 'super-operator',
        dept: 'op',
        role: 'super_admin'
    });

    const response = await testRequest(
        fixture.app,
        `/api/admin/accounts/${fixture.ids.admin}`,
        { method: 'DELETE', headers }
    );

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
        success: false,
        message: '该管理员已有 Fudaba 审核记录，不能删除'
    });
    assert.ok(await fixture.repository.findUserById(fixture.ids.admin));
});

test('administrator deletion preserves Fudaba public-location reviewers', async (t) => {
    const fixture = await createFixture(t);
    t.after(() => fixture.close());
    const submittedAt = '2026-08-03T01:00:00.000Z';
    const reviewedAt = '2026-08-03T02:00:00.000Z';
    await insertPlatformAccount(fixture.connection, 'reviewed-location-owner');
    await fixture.connection.prepare(
        `INSERT INTO fudaba_offices
            (id, owner_account_id, slug, name, city, address, latitude, longitude,
             created_at, updated_at)
         VALUES ('reviewed-location-office', 'reviewed-location-owner',
                 'reviewed-location-office', 'Reviewed office', 'Shanghai',
                 'Private exact address', 31.2304, 121.4737, ?, ?)`
    ).bind(submittedAt, submittedAt).run();
    await insertFudabaOfficePublicLocation(
        fixture.connection,
        'reviewed-location-office',
        submittedAt,
        {
            review_state: 'published',
            revision: 1,
            reviewed_at: reviewedAt,
            reviewed_by: fixture.ids.admin,
            review_audit_id: '00000000-0000-4000-8000-000000000004'
        }
    );
    const headers = await authHeaders(fixture, {
        id: fixture.ids.superAdmin,
        username: 'super-operator',
        dept: 'op',
        role: 'super_admin'
    });

    const response = await testRequest(
        fixture.app,
        `/api/admin/accounts/${fixture.ids.admin}`,
        { method: 'DELETE', headers }
    );

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
        success: false,
        message: '该管理员已有 Fudaba 审核记录，不能删除'
    });
    assert.ok(await fixture.repository.findUserById(fixture.ids.admin));
});
