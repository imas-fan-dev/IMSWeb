'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();

const projectRoot = path.resolve(__dirname, '../..');

function exec(database, sql) {
    return new Promise((resolve, reject) => database.exec(sql, error => error ? reject(error) : resolve()));
}

function all(database, sql) {
    return new Promise((resolve, reject) => database.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));
}

function close(database) {
    return new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));
}

async function validate(directory, requiredTables, requiredColumns = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-d1-migrations-'));
    const database = new sqlite3.Database(path.join(root, 'database.sqlite'));
    try {
        const files = fs.readdirSync(directory).filter(file => file.endsWith('.sql')).sort();
        for (const file of files) await exec(database, fs.readFileSync(path.join(directory, file), 'utf8'));
        const tables = new Set((await all(database,
            "SELECT name FROM sqlite_master WHERE type='table'"
        )).map(row => row.name));
        for (const table of requiredTables) {
            if (!tables.has(table)) throw new Error(`Missing migration table: ${table}`);
        }
        for (const [table, columns] of Object.entries(requiredColumns)) {
            const actual = new Set((await all(database, `PRAGMA table_info(${table})`)).map(row => row.name));
            for (const column of columns) {
                if (!actual.has(column)) throw new Error(`Missing migration column: ${table}.${column}`);
            }
        }
        const foreignKeyErrors = await all(database, 'PRAGMA foreign_key_check');
        if (foreignKeyErrors.length) {
            throw new Error(`Migration schema foreign-key check failed: ${JSON.stringify(foreignKeyErrors)}`);
        }
        return { files: files.length, tables: [...tables].sort() };
    } finally {
        await close(database);
        fs.rmSync(root, { recursive: true, force: true });
    }
}

(async () => {
    const core = await validate(path.join(projectRoot, 'migrations/core'), [
        'users', 'cards', 'object_index', 'upload_operations', 'chronicle_items',
        'chronicle_metadata', 'compensation_jobs'
    ]);
    const story = await validate(path.join(projectRoot, 'migrations/story'), [
        'story_legacy_rows', 'story_cards', 'story_links', 'story_import_runs'
    ], {
        story_legacy_rows: ['legacy_table', 'legacy_id', 'last_seen_run_id'],
        story_cards: ['source_table', 'source_id', 'last_seen_run_id'],
        story_links: ['source_table', 'source_id', 'source_link_index', 'last_seen_run_id']
    });
    process.stdout.write(`${JSON.stringify({ core, story }, null, 2)}\n`);
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
