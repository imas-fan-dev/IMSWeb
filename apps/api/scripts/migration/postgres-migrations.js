'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const packageRoot = path.resolve(__dirname, '../..');
const DEFAULT_MIGRATIONS = path.join(packageRoot, 'migrations/postgresql');
const MIGRATION_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;
const PHASE_LINE = /^-- ims:migration-phase: (pre-data|post-data)$/m;

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function readMigrations(directory = DEFAULT_MIGRATIONS) {
    const migrationsPath = path.resolve(directory);
    const filenames = fs.readdirSync(migrationsPath)
        .filter((filename) => filename.endsWith('.sql'))
        .sort();
    if (!filenames.length) throw new Error(`No PostgreSQL migrations found: ${migrationsPath}`);
    return filenames.map((filename) => {
        if (!MIGRATION_NAME.test(filename)) {
            throw new Error(`Invalid PostgreSQL migration filename: ${filename}`);
        }
        const sql = fs.readFileSync(path.join(migrationsPath, filename), 'utf8');
        const phase = sql.match(PHASE_LINE)?.[1];
        if (!phase) throw new Error(`PostgreSQL migration has no phase marker: ${filename}`);
        return {
            version: filename.slice(0, -4),
            filename,
            phase,
            checksum: sha256(sql),
            sql
        };
    });
}

async function ensureMigrationTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS public.ims_schema_migrations (
            version TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            phase TEXT NOT NULL CHECK (phase IN ('pre-data', 'post-data')),
            checksum TEXT NOT NULL CHECK (length(checksum) = 64),
            applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

async function appliedMigrations(client) {
    const result = await client.query(
        'SELECT version, filename, phase, checksum FROM public.ims_schema_migrations ORDER BY version'
    );
    return new Map(result.rows.map((row) => [row.version, row]));
}

async function applyMigrations(client, options = {}) {
    const migrations = options.migrations || readMigrations(options.directory);
    const selected = options.phase
        ? migrations.filter((migration) => migration.phase === options.phase)
        : migrations;
    await ensureMigrationTable(client);
    const applied = await appliedMigrations(client);
    const executed = [];
    for (const migration of selected) {
        const existing = applied.get(migration.version);
        if (existing) {
            if (existing.checksum !== migration.checksum ||
                existing.filename !== migration.filename || existing.phase !== migration.phase) {
                throw new Error(`Applied PostgreSQL migration drifted: ${migration.filename}`);
            }
            continue;
        }
        await client.query(migration.sql);
        await client.query(
            `INSERT INTO public.ims_schema_migrations
             (version, filename, phase, checksum) VALUES ($1, $2, $3, $4)`,
            [migration.version, migration.filename, migration.phase, migration.checksum]
        );
        executed.push(migration.version);
    }
    return { executed, applied: await appliedMigrations(client) };
}

function databaseUrl(environment = process.env) {
    const value = environment.DATABASE_URL?.trim();
    if (!value) throw new Error('DATABASE_URL is required for PostgreSQL migrations');
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
    }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
        !parsed.hostname || parsed.pathname === '/') {
        throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
    }
    return value;
}

function parseArguments(argv, environment = process.env) {
    let migrationsPath = DEFAULT_MIGRATIONS;
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--') continue;
        if (argv[index] !== '--migrations' || !argv[index + 1]) {
            throw new Error('Usage: postgres-migrations.js [--migrations DIRECTORY]');
        }
        migrationsPath = argv[++index];
    }
    return { connectionString: databaseUrl(environment), migrationsPath };
}

async function migratePostgres(options) {
    const pool = new Pool({
        connectionString: options.connectionString,
        max: 2,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 10_000,
        statement_timeout: 120_000,
        idle_in_transaction_session_timeout: 120_000,
        application_name: 'imsweb-schema-migration',
        allowExitOnIdle: true
    });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('imsweb-schema-migration'))");
        const result = await applyMigrations(client, { directory: options.migrationsPath });
        const version = await client.query('SHOW server_version');
        await client.query('COMMIT');
        return {
            serverVersion: version.rows[0].server_version,
            executed: result.executed,
            applied: [...result.applied.keys()]
        };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) {
    migratePostgres(parseArguments(process.argv.slice(2)))
        .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        });
}

module.exports = {
    DEFAULT_MIGRATIONS,
    applyMigrations,
    databaseUrl,
    migratePostgres,
    parseArguments,
    readMigrations
};
