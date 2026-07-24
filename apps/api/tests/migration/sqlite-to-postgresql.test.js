'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sqlite3 = require('sqlite3').verbose();
const {
    TABLES,
    batchInsertSql,
    inspectSqlite,
    migratedSequenceValue,
    parseArguments
} = require('../../scripts/migration/sqlite-to-postgresql');

function open(filename) {
    return new sqlite3.Database(filename);
}

function exec(database, sql) {
    return new Promise((resolve, reject) => {
        database.exec(sql, (error) => error ? reject(error) : resolve());
    });
}

function close(database) {
    return new Promise((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
    });
}

test('SQLite import arguments preserve foreign-key violations only by explicit opt-in', () => {
    const options = parseArguments([
        '--', '--sqlite', '/tmp/source.db', '--batch-size', '100',
        '--allow-foreign-key-violations'
    ], { DATABASE_URL: 'postgresql://imsweb:secret@localhost/imsweb' });
    assert.equal(options.sqlitePath, '/tmp/source.db');
    assert.equal(options.batchSize, 100);
    assert.equal(options.allowForeignKeyViolations, true);
    assert.throws(
        () => parseArguments(['--batch-size', '0'], {
            DATABASE_URL: 'postgresql://imsweb:secret@localhost/imsweb'
        }),
        /between 1 and 1000/
    );
});

test('PostgreSQL batch inserts quote identifiers and bind every value', () => {
    const table = TABLES.find((candidate) => candidate.name === '765_stories');
    const batch = batchInsertSql(table, [
        Object.fromEntries(table.columns.map((column, index) => [column, index + 1])),
        Object.fromEntries(table.columns.map((column, index) => [column, index + 11]))
    ]);
    assert.match(batch.sql, /INSERT INTO public\."765_stories"/);
    assert.match(batch.sql, /\$1/);
    assert.match(batch.sql, /\$18/);
    assert.equal(batch.values.length, 18);
});

test('PostgreSQL identity keeps SQLite AUTOINCREMENT high-water marks', () => {
    assert.deepEqual(migratedSequenceValue(6535, 6546), { value: 6546, isCalled: true });
    assert.deepEqual(migratedSequenceValue(41, 41), { value: 41, isCalled: true });
    assert.deepEqual(migratedSequenceValue(null, null), { value: 1, isCalled: false });
});

test('SQLite source inspection covers optional site-package tables and reports legacy orphans', async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-pg-source-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const database = open(path.join(root, 'source.db'));
    t.after(() => close(database));
    await exec(database, 'PRAGMA foreign_keys=OFF;');
    for (const table of TABLES) {
        const columns = table.columns.map((column) => {
            if (column === 'id') return '"id" INTEGER PRIMARY KEY';
            if (table.name === 'card_emojis' && column === 'card_id') {
                return '"card_id" INTEGER REFERENCES cards(id)';
            }
            return `"${column}" TEXT`;
        });
        await exec(database, `CREATE TABLE "${table.name}" (${columns.join(', ')})`);
    }
    await exec(database, `
        INSERT INTO card_emojis (id, card_id, emoji, count) VALUES (1, 404, 'like', 1);
        PRAGMA foreign_keys=ON;
    `);
    const report = await inspectSqlite(database);
    assert.equal(Object.keys(report.counts).length, 18);
    assert.equal(report.totalRows, 1);
    assert.equal(report.quickCheck, 'ok');
    assert.deepEqual(report.foreignKeyViolations, [
        { table: 'card_emojis', rowid: 1, parent: 'cards', fkid: 0 }
    ]);
});

test('SQLite source inspection accepts snapshots created before site packages existed', async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-pg-old-source-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const database = open(path.join(root, 'source.db'));
    t.after(() => close(database));
    for (const table of TABLES.filter((candidate) => !candidate.optional)) {
        const columns = table.columns.map((column) =>
            column === 'id' ? '"id" INTEGER PRIMARY KEY' : `"${column}" TEXT`
        );
        await exec(database, `CREATE TABLE "${table.name}" (${columns.join(', ')})`);
    }
    const report = await inspectSqlite(database);
    assert.equal(Object.keys(report.counts).length, 16);
    assert.equal(report.counts.site_packages, undefined);
    assert.equal(report.counts.site_package_revisions, undefined);
});
