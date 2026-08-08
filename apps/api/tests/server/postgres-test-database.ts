import crypto from 'node:crypto';
import { after, type TestContext } from 'node:test';
import { Pool } from 'pg';
import {
    PostgresConnection,
    type PostgresConnectionOptions
} from '@/infra/db/postgresql/connection';

interface PostgresMigrationModule {
    migratePostgres(options: {
        connectionString: string;
        migrationsPath?: string;
    }): Promise<unknown>;
}

const { migratePostgres } = require('../../scripts/migration/postgres-migrations.js') as
    PostgresMigrationModule;

const adminUrl = process.env.IMS_TEST_DATABASE_URL ||
    'postgresql://imsweb:imsweb-local-password@127.0.0.1:5432/postgres';
const adminPool = new Pool({
    connectionString: adminUrl,
    max: 4,
    application_name: 'imsweb-tests-admin',
    allowExitOnIdle: true
});
const connectionUrls = new WeakMap<PostgresConnection, string>();
const connectionGroups = new WeakMap<PostgresConnection, Set<PostgresConnection>>();
const createdDatabases = new Set<string>();
const templateName = databaseName('template');
let template: Promise<void> | undefined;

function databaseName(label: string): string {
    const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 16);
    return `ims_test_${normalized}_${process.pid}_${crypto.randomBytes(5).toString('hex')}`;
}

function quoteIdentifier(value: string): string {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
        throw new Error(`Invalid PostgreSQL test database name: ${value}`);
    }
    return `"${value}"`;
}

function urlForDatabase(name: string): string {
    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    return url.toString();
}

function connectionOptions(connectionString: string): PostgresConnectionOptions {
    return {
        connectionString,
        maxConnections: 4,
        idleTimeoutMs: 5_000,
        connectionTimeoutMs: 5_000,
        statementTimeoutMs: 30_000,
        idleInTransactionTimeoutMs: 30_000
    };
}

async function ensureTemplate(): Promise<void> {
    template ??= (async () => {
        await adminPool.query(`CREATE DATABASE ${quoteIdentifier(templateName)}`);
        createdDatabases.add(templateName);
        await migratePostgres({ connectionString: urlForDatabase(templateName) });
    })();
    return template;
}

async function dropDatabase(name: string): Promise<void> {
    if (!createdDatabases.delete(name)) return;
    await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`);
}

export async function createPostgresTestDatabase(
    t: TestContext,
    label: string
): Promise<PostgresConnection> {
    await ensureTemplate();
    const name = databaseName(label);
    await adminPool.query(
        `CREATE DATABASE ${quoteIdentifier(name)} TEMPLATE ${quoteIdentifier(templateName)}`
    );
    createdDatabases.add(name);
    const connectionString = urlForDatabase(name);
    const database = PostgresConnection.create(connectionOptions(connectionString));
    connectionUrls.set(database, connectionString);
    connectionGroups.set(database, new Set([database]));
    t.after(async () => {
        await Promise.all([...connectionGroups.get(database) ?? []].map((connection) =>
            connection.close()
        ));
        await dropDatabase(name);
    });
    return database;
}

export function connectPostgresTestDatabase(
    _t: TestContext,
    database: PostgresConnection
): PostgresConnection {
    const connectionString = connectionUrls.get(database);
    if (!connectionString) throw new Error('Unknown PostgreSQL test database');
    const connection = PostgresConnection.create(connectionOptions(connectionString));
    connectionGroups.get(database)?.add(connection);
    return connection;
}

after(async () => {
    for (const name of [...createdDatabases].reverse()) {
        await dropDatabase(name);
    }
    await adminPool.end();
});
