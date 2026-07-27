import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHonoApp } from '@/app';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { SqliteConnection } from '@/infra/db/sqlite/connection';
import { SqliteSchemaStrategy } from '@/infra/db/sqlite/schema-strategy';
import { HmacTokenService } from '@/infra/security/hmac/token-service';
import type { AdminRole } from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';

const SECRET = 'admin-accounts-contract-secret-at-least-thirty-two-bytes';

interface Fixture {
    app: ReturnType<typeof createHonoApp>;
    connection: SqliteConnection;
    repository: SqlCoreRepository;
    tokens: HmacTokenService;
    ids: { superAdmin: number; admin: number; editor: number };
    close(): Promise<void>;
}

async function insertAccount(
    connection: SqliteConnection,
    username: string,
    dept: 'op' | 'editor',
    role: AdminRole | null
): Promise<number> {
    const result = await connection.run(
        `INSERT INTO users (username, password, dept, producername, admin_role)
         VALUES (?, 'stored-digest', ?, ?, ?)`,
        [username, dept, `${username} P`, role]
    );
    return result.lastID;
}

async function createFixture(): Promise<Fixture> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-admin-accounts-'));
    const connection = new SqliteConnection(path.join(root, 'core.sqlite'));
    const repository = new SqlCoreRepository(connection, new SqliteSchemaStrategy());
    await repository.initialize();
    const ids = {
        superAdmin: await insertAccount(connection, 'super-operator', 'op', 'super_admin'),
        admin: await insertAccount(connection, 'regular-operator', 'op', 'admin'),
        editor: await insertAccount(connection, 'wiki-editor', 'editor', null)
    };
    const tokens = new HmacTokenService(SECRET);
    const services: RuntimeServices = {
        auth: repository,
        adminAccounts: repository,
        audit: repository,
        passwords: {
            async verify() { return false; },
            async hash(value) { return `hashed:${value}`; }
        },
        tokens,
        config: { cookieSecure: false }
    };
    return {
        app: createHonoApp(() => services),
        connection,
        repository,
        tokens,
        ids,
        async close() {
            await repository.close();
            await fs.rm(root, { recursive: true, force: true });
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
    const fixture = await createFixture();
    t.after(() => fixture.close());

    const regular = await fixture.app.request('http://ims.test/api/admin/accounts', {
        headers: await authHeaders(fixture, {
            id: fixture.ids.admin,
            username: 'regular-operator',
            dept: 'op',
            role: 'admin'
        })
    });
    assert.equal(regular.status, 403);

    const editor = await fixture.app.request('http://ims.test/api/admin/accounts', {
        headers: await authHeaders(fixture, {
            id: fixture.ids.editor,
            username: 'wiki-editor',
            dept: 'editor',
            role: null
        })
    });
    assert.equal(editor.status, 403);

    const response = await fixture.app.request('http://ims.test/api/admin/accounts', {
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
    assert.deepEqual(body.accounts.map((account) => account.username), [
        'super-operator',
        'regular-operator'
    ]);
    assert.deepEqual(body.accounts.map((account) => account.adminRole), [
        'super_admin',
        'admin'
    ]);
});

test('super administrator creates only regular op accounts and audits the mutation', async (t) => {
    const fixture = await createFixture();
    t.after(() => fixture.close());
    const headers = await authHeaders(fixture, {
        id: fixture.ids.superAdmin,
        username: 'super-operator',
        dept: 'op',
        role: 'super_admin'
    });
    const response = await fixture.app.request('http://ims.test/api/admin/accounts', {
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
    assert.equal((await response.json() as { account: { adminRole: AdminRole } }).account.adminRole, 'admin');
    const created = await fixture.repository.findUserByUsername('new-operator');
    assert.ok(created);
    assert.equal(created.dept, 'op');
    assert.equal(created.admin_role, 'admin');
    assert.equal(created.password, 'hashed:secure-password-123');

    const duplicate = await fixture.app.request('http://ims.test/api/admin/accounts', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: 'new-operator',
            producername: 'Duplicate P',
            password: 'another-password-123'
        })
    });
    assert.equal(duplicate.status, 409);

    const logs = await fixture.repository.listRecentAuditLogs(10);
    assert.equal(logs[0]?.action, '新增管理员');
    assert.equal(logs[0]?.target, 'new-operator');
});

test('super administrator deletes a regular op and revokes its refresh sessions', async (t) => {
    const fixture = await createFixture();
    t.after(() => fixture.close());
    await fixture.repository.createRefreshSession({
        id: 'regular-session',
        userId: fixture.ids.admin,
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
    const removeEditor = await fixture.app.request(
        `http://ims.test/api/admin/accounts/${fixture.ids.editor}`,
        { method: 'DELETE', headers }
    );
    assert.equal(removeEditor.status, 404);

    const removeSelf = await fixture.app.request(
        `http://ims.test/api/admin/accounts/${fixture.ids.superAdmin}`,
        { method: 'DELETE', headers }
    );
    assert.equal(removeSelf.status, 409);

    const removed = await fixture.app.request(
        `http://ims.test/api/admin/accounts/${fixture.ids.admin}`,
        { method: 'DELETE', headers }
    );
    assert.equal(removed.status, 200);
    assert.equal(await fixture.repository.findUserById(fixture.ids.admin), null);
    assert.equal(
        await fixture.repository.findRefreshSessionByTokenHash('a'.repeat(64)),
        null
    );
});

test('legacy SQLite op accounts are backfilled and bootstrap selects one explicit super', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-admin-bootstrap-'));
    const connection = new SqliteConnection(path.join(root, 'legacy.sqlite'));
    t.after(async () => {
        await connection.close();
        await fs.rm(root, { recursive: true, force: true });
    });
    await connection.exec(`
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            dept TEXT,
            producername TEXT
        );
        INSERT INTO users (username, password, dept, producername) VALUES
            ('legacy-op', 'digest', 'op', 'Legacy Operator'),
            ('legacy-editor', 'digest', 'editor', 'Legacy Editor');
    `);
    const repository = new SqlCoreRepository(connection, new SqliteSchemaStrategy());
    await repository.initialize();
    assert.equal((await repository.findUserByUsername('legacy-op'))?.admin_role, 'admin');
    assert.equal((await repository.findUserByUsername('legacy-editor'))?.admin_role, null);
    await assert.rejects(repository.ensureSuperAdmin(), /IMS_SUPER_ADMIN_USERNAME/);
    await assert.rejects(
        repository.ensureSuperAdmin('legacy-editor'),
        /existing op account/
    );
    await repository.ensureSuperAdmin('legacy-op');
    assert.equal(
        (await repository.findUserByUsername('legacy-op'))?.admin_role,
        'super_admin'
    );
    await repository.ensureSuperAdmin('legacy-op');
});
