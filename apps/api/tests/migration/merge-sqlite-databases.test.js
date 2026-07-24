'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sqlite3 = require('sqlite3').verbose();
const {
    mergeSqliteDatabases,
    parseArguments
} = require('../../scripts/migration/merge-sqlite-databases');

function open(filename) {
    return new sqlite3.Database(filename);
}

function exec(database, sql) {
    return new Promise((resolve, reject) => {
        database.exec(sql, (error) => error ? reject(error) : resolve());
    });
}

function all(database, sql) {
    return new Promise((resolve, reject) => {
        database.all(sql, (error, rows) => error ? reject(error) : resolve(rows));
    });
}

function close(database) {
    return new Promise((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
    });
}

function sha256(filename) {
    return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

test('SQLite merger accepts pnpm argument separators', () => {
    const options = parseArguments(
        ['--', '--allow-foreign-key-violations'],
        {
            IMS_DB_PATH: '/tmp/core.db',
            IMS_STORY_DB_PATH: '/tmp/story.db',
            IMS_SQLITE_PATH: '/tmp/imsweb.db'
        }
    );
    assert.equal(options.allowForeignKeyViolations, true);
    assert.equal(options.outputPath, '/tmp/imsweb.db');
});

test('SQLite merger creates one verified database without changing either source', async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-sqlite-merge-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const corePath = path.join(root, 'core.db');
    const storyPath = path.join(root, 'story.db');
    const outputPath = path.join(root, 'imsweb.db');

    const core = open(corePath);
    await exec(core, `
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE
        );
        CREATE TABLE cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status TEXT NOT NULL
        );
        INSERT INTO users (username) VALUES ('operator');
        INSERT INTO cards (status) VALUES ('approved'), ('pending');
    `);
    await close(core);

    const story = open(storyPath);
    await exec(story, `
        PRAGMA foreign_keys=ON;
        CREATE TABLE agencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE
        );
        CREATE TABLE idols (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agency_id INTEGER NOT NULL REFERENCES agencies(id),
            name_cn TEXT NOT NULL
        );
        CREATE INDEX idx_idols_agency ON idols(agency_id);
        CREATE TABLE "765_stories" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            idol_id INTEGER NOT NULL REFERENCES idols(id),
            card_name TEXT NOT NULL
        );
        INSERT INTO agencies (code) VALUES ('765');
        INSERT INTO idols (agency_id, name_cn) VALUES (1, 'Haruka');
        INSERT INTO "765_stories" (idol_id, card_name) VALUES (1, 'First');
    `);
    await close(story);
    const sourceHashes = { core: sha256(corePath), story: sha256(storyPath) };

    const report = await mergeSqliteDatabases({ corePath, storyPath, outputPath });
    assert.equal(report.quickCheck, 'ok');
    assert.deepEqual(report.foreignKeyCheck, {
        status: 'ok',
        count: 0,
        violations: []
    });
    assert.equal(report.totalRows, 6);
    assert.deepEqual(report.tables, {
        '765_stories': 1,
        agencies: 1,
        cards: 2,
        idols: 1,
        users: 1
    });
    assert.deepEqual(
        { core: sha256(corePath), story: sha256(storyPath) },
        sourceHashes
    );
    assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);

    const merged = open(outputPath);
    assert.deepEqual(
        await all(merged, "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"),
        [
            { name: '765_stories' },
            { name: 'agencies' },
            { name: 'cards' },
            { name: 'idols' },
            { name: 'users' }
        ]
    );
    assert.deepEqual(await all(merged, 'PRAGMA foreign_key_check'), []);
    assert.deepEqual(
        await all(merged, "SELECT name FROM sqlite_schema WHERE type='index' AND name='idx_idols_agency'"),
        [{ name: 'idx_idols_agency' }]
    );
    await close(merged);

    await assert.rejects(
        mergeSqliteDatabases({ corePath, storyPath, outputPath }),
        /refusing to overwrite/
    );
});

test('SQLite merger rejects schema collisions and leaves no output', async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-sqlite-collision-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const corePath = path.join(root, 'core.db');
    const storyPath = path.join(root, 'story.db');
    const outputPath = path.join(root, 'imsweb.db');
    for (const filename of [corePath, storyPath]) {
        const database = open(filename);
        await exec(database, 'CREATE TABLE duplicated (id INTEGER PRIMARY KEY);');
        await close(database);
    }

    await assert.rejects(
        mergeSqliteDatabases({ corePath, storyPath, outputPath }),
        /schema names collide: duplicated/
    );
    assert.equal(fs.existsSync(outputPath), false);
});

test('SQLite merger requires an explicit opt-in to preserve legacy foreign-key violations', async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-sqlite-foreign-key-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const corePath = path.join(root, 'core.db');
    const storyPath = path.join(root, 'story.db');
    const outputPath = path.join(root, 'imsweb.db');

    const core = open(corePath);
    await exec(core, 'CREATE TABLE users (id INTEGER PRIMARY KEY);');
    await close(core);

    const story = open(storyPath);
    await exec(story, `
        CREATE TABLE idols (id INTEGER PRIMARY KEY);
        CREATE TABLE stories (
            id INTEGER PRIMARY KEY,
            idol_id INTEGER NOT NULL REFERENCES idols(id)
        );
        INSERT INTO stories (id, idol_id) VALUES (1, 404);
    `);
    await close(story);

    await assert.rejects(
        mergeSqliteDatabases({ corePath, storyPath, outputPath }),
        /rerun with --allow-foreign-key-violations/
    );
    assert.equal(fs.existsSync(outputPath), false);

    const report = await mergeSqliteDatabases({
        corePath,
        storyPath,
        outputPath,
        allowForeignKeyViolations: true
    });
    assert.deepEqual(report.foreignKeyCheck, {
        status: 'violations-preserved',
        count: 1,
        violations: [{ table: 'stories', rowid: 1, parent: 'idols', fkid: 0 }]
    });
    assert.equal(fs.existsSync(outputPath), true);
});
