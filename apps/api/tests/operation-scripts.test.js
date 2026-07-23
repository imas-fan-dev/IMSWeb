const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const sqlite3 = require('sqlite3').verbose();

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REPOSITORY_ROOT = path.resolve(PROJECT_ROOT, '../..');
const ADD_USER_SCRIPT = path.join(
    PROJECT_ROOT,
    'scripts/operations/accounts/add-user.js'
);
const HASH_PASSWORD_SCRIPT = path.join(
    PROJECT_ROOT,
    'scripts/operations/accounts/hash-password.js'
);

function run(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, err => err ? reject(err) : resolve());
    });
}

function get(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    });
}

function close(db) {
    return new Promise((resolve, reject) => {
        db.close(err => err ? reject(err) : resolve());
    });
}

test('categorized add-user script resolves project-relative database paths', async () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-ops-test-'));
    const databasePath = path.join(temporaryDirectory, 'accounts.db');
    const database = new sqlite3.Database(databasePath);
    await run(database, `CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        dept TEXT,
        producername TEXT
    )`);
    await close(database);

    try {
        const result = spawnSync(process.execPath, [ADD_USER_SCRIPT], {
            cwd: temporaryDirectory,
            env: {
                ...process.env,
                IMS_DB_PATH: path.relative(REPOSITORY_ROOT, databasePath),
                IMS_NEW_USER_USERNAME: 'categorized-script-test',
                IMS_NEW_USER_PASSWORD: 'temporary-test-password',
                IMS_NEW_USER_DEPT: 'editor',
                IMS_NEW_USER_PRODUCER_NAME: 'Script Test'
            },
            encoding: 'utf8'
        });
        assert.equal(result.status, 0, result.stderr);

        const verificationDatabase = new sqlite3.Database(databasePath);
        const user = await get(
            verificationDatabase,
            'SELECT username, dept, producername, password FROM users WHERE username = ?',
            ['categorized-script-test']
        );
        await close(verificationDatabase);
        assert.equal(user.username, 'categorized-script-test');
        assert.equal(user.dept, 'editor');
        assert.equal(user.producername, 'Script Test');
        assert.match(user.password, /^\$2[aby]\$/);
    } finally {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
});

test('categorized password helper emits a bcrypt hash without database access', () => {
    const result = spawnSync(process.execPath, [HASH_PASSWORD_SCRIPT], {
        cwd: os.tmpdir(),
        env: { ...process.env, IMS_PASSWORD_TO_HASH: 'temporary-test-password' },
        encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout.trim(), /^\$2[aby]\$/);
});
