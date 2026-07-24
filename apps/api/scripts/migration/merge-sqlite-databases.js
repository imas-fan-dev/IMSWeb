'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const sqlite3 = require('sqlite3').verbose();

const packageRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(packageRoot, '../..');

function openDatabase(filename, mode) {
    return new Promise((resolve, reject) => {
        const database = new sqlite3.Database(filename, mode, (error) => {
            if (error) reject(error);
            else resolve(database);
        });
    });
}

function closeDatabase(database) {
    if (!database) return Promise.resolve();
    return new Promise((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
    });
}

function run(database, sql, values = []) {
    return new Promise((resolve, reject) => {
        database.run(sql, values, function onRun(error) {
            if (error) reject(error);
            else resolve({ changes: this.changes, lastID: this.lastID });
        });
    });
}

function all(database, sql, values = []) {
    return new Promise((resolve, reject) => {
        database.all(sql, values, (error, rows) => error ? reject(error) : resolve(rows));
    });
}

function backup(database, destination) {
    return new Promise((resolve, reject) => {
        const operation = database.backup(destination);
        operation.retryErrors = [];
        operation.step(-1, (stepError) => {
            operation.finish((finishError) => {
                const error = stepError || finishError;
                if (error) reject(error);
                else resolve();
            });
        });
    });
}

function quoteIdentifier(value) {
    return `"${String(value).replaceAll('"', '""')}"`;
}

function existingSource(name, value) {
    const candidate = path.resolve(value);
    let stat;
    try {
        stat = fs.lstatSync(candidate);
    } catch (error) {
        throw new Error(`${name} does not exist: ${candidate}`, { cause: error });
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`${name} must be a regular non-symlink SQLite file: ${candidate}`);
    }
    return fs.realpathSync(candidate);
}

function readOnlyUri(filename) {
    const url = pathToFileURL(filename);
    url.searchParams.set('mode', 'ro');
    return url.href;
}

async function userTables(database, schema = 'main') {
    return all(database,
        `SELECT name FROM ${quoteIdentifier(schema)}.sqlite_schema
         WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
}

async function tableCounts(database, schema, tables) {
    const result = {};
    for (const { name } of tables) {
        const row = (await all(database,
            `SELECT COUNT(*) AS total FROM ${quoteIdentifier(schema)}.${quoteIdentifier(name)}`
        ))[0];
        result[name] = Number(row.total);
    }
    return result;
}

async function copyStorySchemaAndData(database) {
    const objects = await all(database, `
        SELECT rowid, type, name, tbl_name, sql
        FROM story.sqlite_schema
        WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL
        ORDER BY CASE type
            WHEN 'table' THEN 0
            WHEN 'index' THEN 1
            WHEN 'trigger' THEN 2
            WHEN 'view' THEN 3
            ELSE 4
        END, rowid
    `);
    const tables = objects.filter((object) => object.type === 'table');
    const existing = new Set((await all(database,
        "SELECT name FROM main.sqlite_schema WHERE name NOT LIKE 'sqlite_%'"
    )).map((row) => row.name));
    const collisions = objects.filter((object) => existing.has(object.name));
    if (collisions.length) {
        throw new Error(
            `Core and Story schema names collide: ${collisions.map((object) => object.name).join(', ')}`
        );
    }

    await run(database, 'BEGIN IMMEDIATE');
    try {
        for (const object of tables) await run(database, object.sql);
        for (const table of tables) {
            const columns = await all(
                database,
                "SELECT name FROM pragma_table_info(?, 'story') ORDER BY cid",
                [table.name]
            );
            if (!columns.length) throw new Error(`Story table has no columns: ${table.name}`);
            const list = columns.map((column) => quoteIdentifier(column.name)).join(', ');
            await run(database,
                `INSERT INTO main.${quoteIdentifier(table.name)} (${list})
                 SELECT ${list} FROM story.${quoteIdentifier(table.name)}`
            );
        }
        for (const object of objects.filter((object) => object.type !== 'table')) {
            await run(database, object.sql);
        }

        const sequences = await all(database,
            `SELECT name, seq FROM story.sqlite_sequence
             WHERE name IN (${tables.map(() => '?').join(',')})`,
            tables.map((table) => table.name)
        ).catch((error) => {
            if (/no such table.*sqlite_sequence/i.test(error.message)) return [];
            throw error;
        });
        for (const sequence of sequences) {
            const updated = await run(
                database,
                'UPDATE main.sqlite_sequence SET seq=? WHERE name=?',
                [sequence.seq, sequence.name]
            );
            if (!updated.changes) {
                await run(
                    database,
                    'INSERT INTO main.sqlite_sequence (name, seq) VALUES (?, ?)',
                    [sequence.name, sequence.seq]
                );
            }
        }
        await run(database, 'COMMIT');
    } catch (error) {
        await run(database, 'ROLLBACK').catch(() => undefined);
        throw error;
    }
    return tables;
}

function assertCounts(source, target, label) {
    for (const [table, count] of Object.entries(source)) {
        if (target[table] !== count) {
            throw new Error(`${label} row count differs for ${table}: ${count} -> ${target[table]}`);
        }
    }
}

async function mergeSqliteDatabases(options) {
    const corePath = existingSource('Core source', options.corePath);
    const storyPath = existingSource('Story source', options.storyPath);
    const outputPath = path.resolve(options.outputPath);
    if (corePath === storyPath || outputPath === corePath || outputPath === storyPath) {
        throw new Error('Core source, Story source, and output must be three different files');
    }
    if (fs.existsSync(outputPath)) {
        throw new Error(`Output already exists; refusing to overwrite: ${outputPath}`);
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const temporaryPath = path.join(
        path.dirname(outputPath),
        `.${path.basename(outputPath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
    );

    let core;
    let target;
    try {
        core = await openDatabase(corePath, sqlite3.OPEN_READONLY);
        const coreTables = await userTables(core);
        const coreCounts = await tableCounts(core, 'main', coreTables);
        await backup(core, temporaryPath);
        fs.chmodSync(temporaryPath, 0o600);
        await closeDatabase(core);
        core = undefined;

        target = await openDatabase(
            temporaryPath,
            sqlite3.OPEN_READWRITE | sqlite3.OPEN_URI
        );
        await run(target, 'PRAGMA foreign_keys=OFF');
        await run(target, 'ATTACH DATABASE ? AS story', [readOnlyUri(storyPath)]);
        const storyTables = await userTables(target, 'story');
        const storyCounts = await tableCounts(target, 'story', storyTables);
        await copyStorySchemaAndData(target);
        await run(target, 'DETACH DATABASE story');
        await run(target, 'PRAGMA foreign_keys=ON');

        const mergedTables = await userTables(target);
        const mergedCounts = await tableCounts(target, 'main', mergedTables);
        assertCounts(coreCounts, mergedCounts, 'Core');
        assertCounts(storyCounts, mergedCounts, 'Story');
        const foreignKeyErrors = await all(target, 'PRAGMA foreign_key_check');
        if (foreignKeyErrors.length && !options.allowForeignKeyViolations) {
            throw new Error(
                `Merged database has ${foreignKeyErrors.length} foreign-key violation(s); ` +
                'rerun with --allow-foreign-key-violations to preserve and report them'
            );
        }
        const quickCheck = await all(target, 'PRAGMA quick_check');
        if (quickCheck.length !== 1 || Object.values(quickCheck[0])[0] !== 'ok') {
            throw new Error(`Merged database quick_check failed: ${JSON.stringify(quickCheck)}`);
        }
        await closeDatabase(target);
        target = undefined;
        fs.renameSync(temporaryPath, outputPath);
        return {
            output: outputPath,
            sources: { core: corePath, story: storyPath },
            tables: mergedCounts,
            totalRows: Object.values(mergedCounts).reduce((total, count) => total + count, 0),
            foreignKeyCheck: foreignKeyErrors.length ? {
                status: 'violations-preserved',
                count: foreignKeyErrors.length,
                violations: foreignKeyErrors
            } : {
                status: 'ok',
                count: 0,
                violations: []
            },
            quickCheck: 'ok'
        };
    } catch (error) {
        await closeDatabase(target).catch(() => undefined);
        await closeDatabase(core).catch(() => undefined);
        fs.rmSync(temporaryPath, { force: true });
        throw error;
    }
}

function parseArguments(argv, environment = process.env) {
    const values = new Map();
    let allowForeignKeyViolations = false;
    for (let index = 0; index < argv.length; index += 1) {
        const name = argv[index];
        if (name === '--') continue;
        if (name === '--allow-foreign-key-violations') {
            allowForeignKeyViolations = true;
            continue;
        }
        if (!['--core', '--story', '--output'].includes(name) || !argv[index + 1]) {
            throw new Error(
                'Usage: merge-sqlite-databases.js [--core FILE] [--story FILE] ' +
                '[--output FILE] [--allow-foreign-key-violations]'
            );
        }
        values.set(name, argv[++index]);
    }
    return {
        corePath: values.get('--core') || environment.IMS_DB_PATH ||
            path.join(repositoryRoot, 'apps/legacy/data/core/news.db'),
        storyPath: values.get('--story') || environment.IMS_STORY_DB_PATH ||
            path.join(repositoryRoot, 'apps/legacy/data/story/idol_data.db'),
        outputPath: values.get('--output') || environment.IMS_SQLITE_PATH ||
            path.join(repositoryRoot, 'apps/legacy/data/imsweb.db'),
        allowForeignKeyViolations
    };
}

if (require.main === module) {
    mergeSqliteDatabases(parseArguments(process.argv.slice(2)))
        .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        });
}

module.exports = { mergeSqliteDatabases, parseArguments };
