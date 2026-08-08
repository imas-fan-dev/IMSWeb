import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryResult } from 'pg';
import {
    PostgresConnection,
    translatePostgresParameters,
    type PostgresPool
} from '@/infra/db/postgresql/connection';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';

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

    await assert.rejects(database.transaction(async (transaction) => {
        await transaction.prepare('UPDATE entries SET name=? WHERE id=?').bind('tx', 42).run();
        throw new Error('abort callback');
    }), /abort callback/);
    assert.deepEqual(
        calls.slice(-3).map((call) => [call.sql, call.client]),
        [
            ['BEGIN', true],
            ['UPDATE entries SET name=$1 WHERE id=$2', true],
            ['ROLLBACK', true]
        ]
    );
    assert.equal(releases, 3);

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

test('PostgreSQL reaction upsert qualifies the existing count', async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const pool = {
        async query(sql: string, values?: unknown[]) {
            calls.push({ sql, values });
            return pgResult([], 1);
        },
        async connect() {
            throw new Error('reaction upsert must not open a transaction');
        },
        async end() {}
    } as unknown as PostgresPool;
    const repository = new SqlCoreRepository(
        new PostgresConnection(pool),
        new PostgresqlSchemaStrategy()
    );

    await repository.incrementReaction(456, '❤️');

    assert.match(
        calls[0]?.sql ?? '',
        /ON CONFLICT\(card_id, emoji\) DO UPDATE SET count=card_emojis\.count\+1/
    );
    assert.deepEqual(calls[0]?.values, [456, '❤️']);
});
