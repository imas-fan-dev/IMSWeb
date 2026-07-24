import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { QueryResult } from 'pg';
import {
    PostgresConnection,
    translatePostgresParameters,
    type PostgresPool
} from '@/infra/db/postgresql/connection';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { SqliteConnection } from '@/infra/db/sqlite/connection';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';

test('SQLite implements the SQL port with returning rows and atomic batches', async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-sql-port-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));

    const database: ManagedSqlDatabase = new SqliteConnection(path.join(root, 'port.sqlite'));
    t.after(() => database.close());
    await database.executeScript(`
        CREATE TABLE entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
    `);

    const inserted = await database.prepare(
        'INSERT INTO entries (name) VALUES (?) RETURNING id, name'
    ).bind('first').first<{ id: number; name: string }>();
    assert.deepEqual(inserted, { id: 1, name: 'first' });

    await database.batch([
        database.prepare('INSERT INTO entries (name) VALUES (?)').bind('second'),
        database.prepare('INSERT INTO entries (name) VALUES (?)').bind('third')
    ]);
    assert.equal(
        await database.prepare('SELECT COUNT(*) FROM entries').first<number>('COUNT(*)'),
        3
    );

    await assert.rejects(database.batch([
        database.prepare('INSERT INTO entries (name) VALUES (?)').bind('rolled-back'),
        database.prepare('INSERT INTO entries (name) VALUES (?)').bind('first')
    ]), /UNIQUE constraint failed/);
    assert.equal(
        await database.prepare(
            "SELECT COUNT(*) FROM entries WHERE name='rolled-back'"
        ).first<number>('COUNT(*)'),
        0
    );
});

test('SQLite close is idempotent for repositories sharing one connection', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-sql-close-'));
    try {
        const database = new SqliteConnection(path.join(root, 'shared.sqlite'));
        await database.executeScript('CREATE TABLE entries (id INTEGER PRIMARY KEY);');
        await Promise.all([database.close(), database.close()]);
        await database.close();
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});

function pgResult(
    rows: Array<Record<string, unknown>> = [],
    rowCount = rows.length,
    bigintFields: string[] = []
): QueryResult {
    return {
        command: rows.length ? 'SELECT' : '',
        rowCount,
        oid: 0,
        fields: bigintFields.map((name) => ({
            name,
            tableID: 0,
            columnID: 0,
            dataTypeID: 20,
            dataTypeSize: 8,
            dataTypeModifier: -1,
            format: 'text'
        })),
        rows
    } as QueryResult;
}

test('PostgreSQL parameter translation ignores quoted and commented question marks', () => {
    assert.deepEqual(
        translatePostgresParameters(
            "SELECT '?', \"?\", $$?$$, value FROM data WHERE a=? AND b=? -- ?\n/* ? */"
        ),
        {
            sql: "SELECT '?', \"?\", $$?$$, value FROM data WHERE a=$1 AND b=$2 -- ?\n/* ? */",
            parameters: 2
        }
    );
});

test('PostgreSQL implements the SQL port with one short transaction per batch', async () => {
    const calls: Array<{ sql: string; values?: unknown[]; client: boolean }> = [];
    let releases = 0;
    let closes = 0;
    const execute = async (sql: string, values: unknown[] | undefined, client: boolean) => {
        calls.push({ sql, values, client });
        if (sql.includes('FAIL')) throw new Error('forced failure');
        if (sql.includes('RETURNING id')) return pgResult([{ id: '42' }], 1, ['id']);
        return pgResult([], sql.startsWith('UPDATE') ? 1 : 0);
    };
    const client = {
        query: (sql: string, values?: unknown[]) => execute(sql, values, true),
        release: () => { releases += 1; }
    };
    const pool = {
        query: (sql: string, values?: unknown[]) => execute(sql, values, false),
        connect: async () => client,
        end: async () => { closes += 1; }
    } as unknown as PostgresPool;
    const database: ManagedSqlDatabase = new PostgresConnection(pool);

    assert.deepEqual(
        await database.prepare('INSERT INTO entries (name) VALUES (?) RETURNING id')
            .bind('first')
            .first(),
        { id: 42 }
    );
    await database.batch([
        database.prepare('UPDATE entries SET name=? WHERE id=?').bind('second', 42),
        database.prepare('UPDATE entries SET name=? WHERE id=?').bind('third', 43)
    ]);
    assert.deepEqual(
        calls.slice(1).map((call) => [call.sql, call.client]),
        [
            ['BEGIN', true],
            ['UPDATE entries SET name=$1 WHERE id=$2', true],
            ['UPDATE entries SET name=$1 WHERE id=$2', true],
            ['COMMIT', true]
        ]
    );
    assert.equal(releases, 1);

    await assert.rejects(database.batch([
        database.prepare('UPDATE entries SET name=? WHERE id=?').bind('ok', 42),
        database.prepare('FAIL ?').bind('now')
    ]), /forced failure/);
    assert.equal(calls.at(-1)?.sql, 'ROLLBACK');
    assert.equal(releases, 2);

    await Promise.all([database.close(), database.close()]);
    assert.equal(closes, 1);
});

test('PostgreSQL news pagination uses a bounded descending id range', async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const pool = {
        async query(sql: string, values?: unknown[]) {
            calls.push({ sql, values });
            if (sql.includes('MAX(id)')) return pgResult([{ id: '9' }]);
            return pgResult([
                { id: '6', title: 'News 6' },
                { id: '5', title: 'News 5' }
            ], 2, ['id']);
        },
        async connect() {
            throw new Error('pagination reads must not open a transaction');
        },
        async end() {}
    } as unknown as PostgresPool;
    const repository = new SqlCoreRepository(
        new PostgresConnection(pool),
        new PostgresqlSchemaStrategy()
    );

    assert.equal(await repository.findLatestPublicNewsId(), '9');
    assert.deepEqual(
        await repository.listPublicNewsByCursor(3, '9', '7'),
        [
            { id: 6, title: 'News 6' },
            { id: 5, title: 'News 5' }
        ]
    );
    assert.match(calls[1]?.sql ?? '', /WHERE id<=\$1 AND id<\$2 ORDER BY id DESC LIMIT \$3/);
    assert.deepEqual(calls[1]?.values, ['9', '7', 3]);
});
