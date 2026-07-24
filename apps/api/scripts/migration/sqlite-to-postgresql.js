'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const {
    DEFAULT_MIGRATIONS,
    applyMigrations,
    databaseUrl,
    readMigrations
} = require('./postgres-migrations');

const packageRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(packageRoot, '../..');
const STORY_COLUMNS = [
    'id', 'idol_id', 'category', 'card_name', 'up_name',
    'video_title', 'url', 'subtitle', 'image_file'
];
const TABLES = [
    { name: 'users', columns: ['id', 'username', 'password', 'dept', 'producername'] },
    { name: 'logs', columns: ['id', 'username', 'producername', 'action', 'target', 'ip', 'time'] },
    { name: 'news', columns: ['id', 'title', 'image', 'thumbnail', 'content', 'date', 'author'] },
    { name: 'events', columns: ['id', 'title', 'name', 'contact', 'image_url', 'created_at'] },
    {
        name: 'cards',
        columns: ['id', 'image1_url', 'image2_url', 'hash1', 'hash2', 'ip', 'status', 'created_at']
    },
    { name: 'card_emojis', columns: ['id', 'card_id', 'emoji', 'count'] },
    { name: 'agencies', columns: ['id', 'code', 'name_cn', 'color'] },
    { name: 'idols', columns: ['id', 'agency_id', 'name_cn', 'folder_name', 'color'] },
    { name: 'theme_colors', columns: ['name', 'color'], sequence: false },
    { name: '765_stories', columns: STORY_COLUMNS },
    { name: '876_stories', columns: STORY_COLUMNS },
    { name: 'cg_stories', columns: STORY_COLUMNS },
    { name: 'ml_stories', columns: STORY_COLUMNS },
    { name: 'sidem_stories', columns: STORY_COLUMNS },
    { name: 'sc_stories', columns: STORY_COLUMNS },
    { name: 'gk_stories', columns: STORY_COLUMNS },
    {
        name: 'site_packages',
        columns: [
            'id', 'slug', 'title', 'description', 'published_revision_id',
            'created_by', 'updated_by', 'created_at', 'updated_at'
        ],
        optional: true,
        sequence: false
    },
    {
        name: 'site_package_revisions',
        columns: [
            'id', 'package_id', 'revision_number', 'entry_path', 'runtime_mode',
            'state', 'file_count', 'total_bytes', 'source_key', 'source_sha256',
            'manifest_key', 'manifest_json', 'preview_token_hash', 'created_by',
            'created_at', 'published_at'
        ],
        optional: true,
        sequence: false
    }
];

function quoteIdentifier(value) {
    return `"${String(value).replaceAll('"', '""')}"`;
}

function sqliteAll(database, sql, values = []) {
    return new Promise((resolve, reject) => {
        database.all(sql, values, (error, rows) => error ? reject(error) : resolve(rows));
    });
}

function sqliteRun(database, sql) {
    return new Promise((resolve, reject) => {
        database.run(sql, (error) => error ? reject(error) : resolve());
    });
}

function openSqlite(filename) {
    return new Promise((resolve, reject) => {
        const database = new sqlite3.Database(filename, sqlite3.OPEN_READONLY, (error) => {
            if (error) reject(error);
            else resolve(database);
        });
    });
}

function closeSqlite(database) {
    if (!database) return Promise.resolve();
    return new Promise((resolve, reject) => {
        database.close((error) => error ? reject(error) : resolve());
    });
}

function sha256File(filename) {
    return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function existingSqlite(filename) {
    const candidate = path.resolve(filename);
    const stat = fs.lstatSync(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`SQLite source must be a regular non-symlink file: ${candidate}`);
    }
    for (const suffix of ['-wal', '-shm', '-journal']) {
        if (fs.existsSync(`${candidate}${suffix}`)) {
            throw new Error(`SQLite source has an active ${suffix} sidecar; migrate a stable backup`);
        }
    }
    return { path: fs.realpathSync(candidate), size: stat.size, mtimeMs: stat.mtimeMs };
}

async function inspectSqlite(database) {
    const quickCheck = await sqliteAll(database, 'PRAGMA quick_check');
    if (quickCheck.length !== 1 || Object.values(quickCheck[0])[0] !== 'ok') {
        throw new Error(`SQLite quick_check failed: ${JSON.stringify(quickCheck)}`);
    }
    const existing = new Set((await sqliteAll(database,
        "SELECT name FROM sqlite_schema WHERE type='table'"
    )).map((row) => row.name));
    const counts = {};
    for (const table of TABLES) {
        if (!existing.has(table.name)) {
            if (table.optional) continue;
            throw new Error(`SQLite source is missing table: ${table.name}`);
        }
        const columns = (await sqliteAll(
            database,
            `PRAGMA table_info(${quoteIdentifier(table.name)})`
        )).map((column) => column.name);
        const missing = table.columns.filter((column) => !columns.includes(column));
        if (missing.length) {
            throw new Error(`SQLite table ${table.name} is missing columns: ${missing.join(', ')}`);
        }
        const row = (await sqliteAll(
            database,
            `SELECT COUNT(*) AS total FROM ${quoteIdentifier(table.name)}`
        ))[0];
        counts[table.name] = Number(row.total);
    }
    return {
        counts,
        totalRows: Object.values(counts).reduce((total, count) => total + count, 0),
        foreignKeyViolations: await sqliteAll(database, 'PRAGMA foreign_key_check'),
        presentTables: Object.keys(counts),
        quickCheck: 'ok'
    };
}

function batchInsertSql(table, rows) {
    const columns = table.columns.map(quoteIdentifier).join(', ');
    let parameter = 0;
    const values = [];
    const groups = rows.map((row) => `(${table.columns.map((column) => {
        values.push(row[column]);
        parameter += 1;
        return `$${parameter}`;
    }).join(', ')})`);
    return {
        sql: `INSERT INTO public.${quoteIdentifier(table.name)} (${columns}) VALUES ${groups.join(', ')}`,
        values
    };
}

async function insertTable(client, database, table, batchSize) {
    const orderColumn = table.columns.includes('id') ? 'id' : table.columns[0];
    const rows = await sqliteAll(
        database,
        `SELECT ${table.columns.map(quoteIdentifier).join(', ')}
         FROM ${quoteIdentifier(table.name)} ORDER BY ${quoteIdentifier(orderColumn)}`
    );
    for (let offset = 0; offset < rows.length; offset += batchSize) {
        const batch = batchInsertSql(table, rows.slice(offset, offset + batchSize));
        await client.query(batch.sql, batch.values);
    }
    return rows.length;
}

async function targetCounts(client, tables = TABLES) {
    const counts = {};
    for (const table of tables) {
        const result = await client.query(
            `SELECT COUNT(*)::bigint AS total FROM public.${quoteIdentifier(table.name)}`
        );
        counts[table.name] = Number(result.rows[0].total);
    }
    return counts;
}

function assertCounts(expected, actual) {
    for (const [table, expectedCount] of Object.entries(expected)) {
        if (expectedCount !== actual[table]) {
            throw new Error(
                `PostgreSQL row count differs for ${table}: ` +
                `${expectedCount} -> ${actual[table]}`
            );
        }
    }
}

function migratedSequenceValue(maximumId, sqliteSequence) {
    const values = [maximumId, sqliteSequence]
        .filter((value) => value !== null && value !== undefined)
        .map(Number);
    if (!values.length || values.every((value) => value < 1)) {
        return { value: 1, isCalled: false };
    }
    return { value: Math.max(...values), isCalled: true };
}

async function resetSequences(client, database, tables = TABLES) {
    const values = {};
    for (const table of tables.filter((candidate) => candidate.sequence !== false)) {
        const relation = `public.${quoteIdentifier(table.name)}`;
        const maximum = await client.query(`SELECT MAX(id)::bigint AS value FROM ${relation}`);
        const sourceSequence = await sqliteAll(
            database,
            'SELECT seq FROM sqlite_sequence WHERE name=?',
            [table.name]
        ).catch((error) => {
            if (/no such table.*sqlite_sequence/i.test(error.message)) return [];
            throw error;
        });
        const sequence = migratedSequenceValue(
            maximum.rows[0].value,
            sourceSequence[0]?.seq
        );
        const result = await client.query(
            `SELECT setval(pg_get_serial_sequence($1, 'id'), $2, $3) AS value`,
            [relation, sequence.value, sequence.isCalled]
        );
        values[table.name] = Number(result.rows[0].value);
    }
    return values;
}

async function foreignKeyReport(client) {
    const legacy = await client.query(`
        SELECT e.id, e.card_id
        FROM public.card_emojis e
        LEFT JOIN public.cards c ON c.id = e.card_id
        WHERE c.id IS NULL
        ORDER BY e.id
    `);
    const other = await client.query(`
        SELECT 'idols.agency_id' AS relation, COUNT(*)::bigint AS violations
        FROM public.idols i LEFT JOIN public.agencies a ON a.id = i.agency_id
        WHERE a.id IS NULL
        UNION ALL
        SELECT table_name || '.idol_id', violations FROM (
            SELECT '765_stories' AS table_name, COUNT(*)::bigint AS violations
            FROM public."765_stories" s LEFT JOIN public.idols i ON i.id = s.idol_id WHERE i.id IS NULL
            UNION ALL SELECT '876_stories', COUNT(*)::bigint
            FROM public."876_stories" s LEFT JOIN public.idols i ON i.id = s.idol_id WHERE i.id IS NULL
            UNION ALL SELECT 'cg_stories', COUNT(*)::bigint
            FROM public.cg_stories s LEFT JOIN public.idols i ON i.id = s.idol_id WHERE i.id IS NULL
            UNION ALL SELECT 'ml_stories', COUNT(*)::bigint
            FROM public.ml_stories s LEFT JOIN public.idols i ON i.id = s.idol_id WHERE i.id IS NULL
            UNION ALL SELECT 'sidem_stories', COUNT(*)::bigint
            FROM public.sidem_stories s LEFT JOIN public.idols i ON i.id = s.idol_id WHERE i.id IS NULL
            UNION ALL SELECT 'sc_stories', COUNT(*)::bigint
            FROM public.sc_stories s LEFT JOIN public.idols i ON i.id = s.idol_id WHERE i.id IS NULL
            UNION ALL SELECT 'gk_stories', COUNT(*)::bigint
            FROM public.gk_stories s LEFT JOIN public.idols i ON i.id = s.idol_id WHERE i.id IS NULL
        ) story_relations
    `);
    const constraint = await client.query(`
        SELECT conname, convalidated
        FROM pg_constraint
        WHERE conrelid = 'public.card_emojis'::regclass
          AND conname = 'card_emojis_card_id_fkey'
    `);
    return {
        legacyCardEmojiViolations: legacy.rows,
        otherViolations: other.rows.map((row) => ({
            relation: row.relation,
            count: Number(row.violations)
        })),
        legacyConstraint: constraint.rows[0]
    };
}

function parseArguments(argv, environment = process.env) {
    let sqlitePath = environment.IMS_SQLITE_PATH ||
        path.join(repositoryRoot, 'data/imsweb.db');
    let migrationsPath = DEFAULT_MIGRATIONS;
    let allowForeignKeyViolations = false;
    let batchSize = 250;
    for (let index = 0; index < argv.length; index += 1) {
        const name = argv[index];
        if (name === '--') continue;
        if (name === '--allow-foreign-key-violations') {
            allowForeignKeyViolations = true;
            continue;
        }
        if (!['--sqlite', '--migrations', '--batch-size'].includes(name) || !argv[index + 1]) {
            throw new Error(
                'Usage: sqlite-to-postgresql.js [--sqlite FILE] [--migrations DIRECTORY] ' +
                '[--batch-size N] [--allow-foreign-key-violations]'
            );
        }
        const value = argv[++index];
        if (name === '--sqlite') sqlitePath = value;
        else if (name === '--migrations') migrationsPath = value;
        else batchSize = Number(value);
    }
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
        throw new Error('--batch-size must be an integer between 1 and 1000');
    }
    return {
        connectionString: databaseUrl(environment),
        sqlitePath,
        migrationsPath,
        allowForeignKeyViolations,
        batchSize
    };
}

async function migrateSqliteToPostgres(options) {
    const source = existingSqlite(options.sqlitePath);
    source.sha256 = sha256File(source.path);
    const database = await openSqlite(source.path);
    let pool;
    let client;
    try {
        await sqliteRun(database, 'BEGIN');
        const inspection = await inspectSqlite(database);
        const sourceTables = TABLES.filter((table) => inspection.presentTables.includes(table.name));
        if (inspection.foreignKeyViolations.length && !options.allowForeignKeyViolations) {
            throw new Error(
                `SQLite source has ${inspection.foreignKeyViolations.length} foreign-key ` +
                'violation(s); rerun with --allow-foreign-key-violations to preserve and report them'
            );
        }
        const migrations = readMigrations(options.migrationsPath);
        pool = new Pool({
            connectionString: options.connectionString,
            max: 2,
            connectionTimeoutMillis: 5_000,
            idleTimeoutMillis: 10_000,
            statement_timeout: 120_000,
            idle_in_transaction_session_timeout: 120_000,
            application_name: 'imsweb-sqlite-import',
            allowExitOnIdle: true
        });
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('imsweb-schema-migration'))");
        await applyMigrations(client, { migrations, phase: 'pre-data' });

        const previous = await client.query(
            'SELECT row_counts FROM public.ims_data_migrations WHERE source_sha256 = $1',
            [source.sha256]
        );
        if (previous.rows.length) {
            const counts = await targetCounts(client);
            assertCounts(inspection.counts, counts);
            await client.query('ROLLBACK');
            return {
                status: 'already-imported',
                source: { filename: path.basename(source.path), sha256: source.sha256, size: source.size },
                tables: counts,
                totalRows: inspection.totalRows
            };
        }

        const before = await targetCounts(client);
        const nonEmpty = Object.entries(before).filter(([, count]) => count !== 0);
        if (nonEmpty.length) {
            throw new Error(
                `PostgreSQL target is not empty: ${nonEmpty.map(([name, count]) => `${name}=${count}`).join(', ')}`
            );
        }
        const applied = await client.query(
            "SELECT version FROM public.ims_schema_migrations WHERE phase='post-data' LIMIT 1"
        );
        if (applied.rows.length && inspection.foreignKeyViolations.length) {
            throw new Error('PostgreSQL post-data constraints were applied before the legacy import');
        }

        const imported = {};
        for (const table of sourceTables) {
            imported[table.name] = await insertTable(
                client,
                database,
                table,
                options.batchSize
            );
        }
        assertCounts(inspection.counts, imported);
        const sequences = await resetSequences(client, database, sourceTables);
        await applyMigrations(client, { migrations, phase: 'post-data' });
        const target = await targetCounts(client);
        assertCounts(inspection.counts, target);
        const foreignKeys = await foreignKeyReport(client);
        const unexpected = foreignKeys.otherViolations.filter((item) => item.count !== 0);
        if (unexpected.length) {
            throw new Error(`Unexpected PostgreSQL foreign-key violations: ${JSON.stringify(unexpected)}`);
        }
        if (foreignKeys.legacyCardEmojiViolations.length !== inspection.foreignKeyViolations.length) {
            throw new Error(
                'Legacy foreign-key violation count changed during PostgreSQL migration: ' +
                `${inspection.foreignKeyViolations.length} -> ` +
                `${foreignKeys.legacyCardEmojiViolations.length}`
            );
        }
        const current = fs.statSync(source.path);
        if (current.size !== source.size || current.mtimeMs !== source.mtimeMs ||
            sha256File(source.path) !== source.sha256) {
            throw new Error('SQLite source changed while the PostgreSQL migration was running');
        }
        await client.query(
            `INSERT INTO public.ims_data_migrations
             (source_sha256, source_filename, source_size_bytes, row_counts,
              source_foreign_key_violations)
             VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
            [
                source.sha256,
                path.basename(source.path),
                source.size,
                JSON.stringify(target),
                JSON.stringify(inspection.foreignKeyViolations)
            ]
        );
        const server = await client.query('SHOW server_version');
        const schema = await client.query(
            'SELECT version FROM public.ims_schema_migrations ORDER BY version'
        );
        await client.query('COMMIT');
        return {
            status: 'imported',
            serverVersion: server.rows[0].server_version,
            source: { filename: path.basename(source.path), sha256: source.sha256, size: source.size },
            schemaMigrations: schema.rows.map((row) => row.version),
            tables: target,
            totalRows: inspection.totalRows,
            sequences,
            sourceForeignKeyCheck: inspection.foreignKeyViolations.length ? {
                status: 'violations-preserved',
                count: inspection.foreignKeyViolations.length,
                violations: inspection.foreignKeyViolations
            } : { status: 'ok', count: 0, violations: [] },
            targetForeignKeyCheck: foreignKeys
        };
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        if (client) client.release();
        if (pool) await pool.end();
        await sqliteRun(database, 'ROLLBACK').catch(() => undefined);
        await closeSqlite(database);
    }
}

if (require.main === module) {
    migrateSqliteToPostgres(parseArguments(process.argv.slice(2)))
        .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        });
}

module.exports = {
    TABLES,
    batchInsertSql,
    inspectSqlite,
    migratedSequenceValue,
    migrateSqliteToPostgres,
    parseArguments
};
