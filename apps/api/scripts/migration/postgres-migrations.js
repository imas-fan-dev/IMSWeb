'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const packageRoot = path.resolve(__dirname, '../..');
const DEFAULT_MIGRATIONS = path.join(packageRoot, 'migrations/postgresql');
const MIGRATION_NAME = /^(?:(\d{4})|(\d{14}))_([a-z0-9_]+)\.sql$/;
const LAST_SEQUENTIAL_MIGRATION = 19;
const PHASE_LINE = /^-- ims:migration-phase: (pre-data|post-data)$/m;

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function isValidTimestamp(value) {
    const parts = value.match(
        /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/
    );
    if (!parts) return false;
    const [, year, month, day, hour, minute, second] = parts.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    return date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day &&
        date.getUTCHours() === hour &&
        date.getUTCMinutes() === minute &&
        date.getUTCSeconds() === second;
}

function validateMigrationFilenames(filenames) {
    const prefixes = new Set();
    for (const filename of filenames) {
        const match = filename.match(MIGRATION_NAME);
        if (!match) {
            throw new Error(`Invalid PostgreSQL migration filename: ${filename}`);
        }
        const [, sequential, timestamp] = match;
        const prefix = sequential || timestamp;
        if (prefixes.has(prefix)) {
            throw new Error(`Duplicate PostgreSQL migration prefix: ${prefix}`);
        }
        prefixes.add(prefix);
        if (sequential && (
            Number(sequential) < 1 || Number(sequential) > LAST_SEQUENTIAL_MIGRATION
        )) {
            throw new Error(
                `New PostgreSQL migrations must use a 14-digit UTC timestamp: ${filename}`
            );
        }
        if (timestamp && !isValidTimestamp(timestamp)) {
            throw new Error(`Invalid PostgreSQL migration timestamp: ${filename}`);
        }
    }
}

function readMigrations(directory = DEFAULT_MIGRATIONS) {
    const migrationsPath = path.resolve(directory);
    const filenames = fs.readdirSync(migrationsPath)
        .filter((filename) => filename.endsWith('.sql'))
        .sort();
    if (!filenames.length) throw new Error(`No PostgreSQL migrations found: ${migrationsPath}`);
    validateMigrationFilenames(filenames);
    return filenames.map((filename) => {
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

function migrationCatalog(directory = DEFAULT_MIGRATIONS) {
    const migrations = readMigrations(directory);
    return {
        directory: path.resolve(directory),
        count: migrations.length,
        migrations: migrations.map(({ version, filename, phase, checksum }) => ({
            version,
            filename,
            phase,
            checksum
        }))
    };
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

function validateAppliedMigrations(migrations, applied) {
    const catalog = new Map(
        migrations.map((migration) => [migration.version, migration])
    );
    for (const existing of applied.values()) {
        const migration = catalog.get(existing.version);
        if (!migration || existing.filename !== migration.filename ||
            existing.phase !== migration.phase || existing.checksum !== migration.checksum) {
            throw new Error(
                `Applied PostgreSQL migration drifted from catalog: ` +
                `${existing.version} (${existing.filename})`
            );
        }
    }
}

async function applyMigrations(client, options = {}) {
    const migrations = options.migrations || readMigrations(options.directory);
    await ensureMigrationTable(client);
    const applied = await appliedMigrations(client);
    validateAppliedMigrations(migrations, applied);
    const selected = options.phase
        ? migrations.filter((migration) => migration.phase === options.phase)
        : migrations;
    const executed = [];
    for (const migration of selected) {
        const existing = applied.get(migration.version);
        if (existing) {
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
    let command = 'migrate';
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--') continue;
        if (argv[index] === '--list') {
            command = 'list';
            continue;
        }
        if (argv[index] !== '--migrations' || !argv[index + 1]) {
            throw new Error(
                'Usage: postgres-migrations.js [--list] [--migrations DIRECTORY]'
            );
        }
        migrationsPath = argv[++index];
    }
    return command === 'list'
        ? { command, migrationsPath }
        : { command, connectionString: databaseUrl(environment), migrationsPath };
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
    const options = parseArguments(process.argv.slice(2));
    const operation = options.command === 'list'
        ? Promise.resolve(migrationCatalog(options.migrationsPath))
        : migratePostgres(options);
    operation
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
    migrationCatalog,
    migratePostgres,
    parseArguments,
    readMigrations,
    validateMigrationFilenames
};
