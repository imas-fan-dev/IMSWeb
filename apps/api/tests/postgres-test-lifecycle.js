'use strict';

const crypto = require('node:crypto');

const DEFAULT_ADMIN_URL =
    'postgresql://imsweb:imsweb-local-password@127.0.0.1:5432/postgres';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);
const DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/;
const CONNECTION_OPTIONS = Object.freeze({
    maxConnections: 4,
    idleTimeoutMs: 5_000,
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 30_000,
    idleInTransactionTimeoutMs: 30_000
});
const DISABLED_REASON =
    'PostgreSQL tests disabled by IMS_TEST_POSTGRES_ENABLED=false';

function resolvePostgresTestConfig(environment = process.env) {
    const enabledValue = environment.IMS_TEST_POSTGRES_ENABLED;
    if (enabledValue !== undefined) {
        if (enabledValue !== 'true' && enabledValue !== 'false') {
            throw new Error(
                'IMS_TEST_POSTGRES_ENABLED must be exactly "true" or "false"'
            );
        }
        if (enabledValue === 'false') {
            return { enabled: false, adminUrl: null, source: null };
        }
    }

    const configuredAdminUrl = environment.IMS_TEST_POSTGRES_ADMIN_URL?.trim();
    const configuredDatabaseUrl = environment.IMS_TEST_DATABASE_URL?.trim();
    const source = configuredAdminUrl
        ? 'IMS_TEST_POSTGRES_ADMIN_URL'
        : configuredDatabaseUrl
            ? 'IMS_TEST_DATABASE_URL'
            : 'default';
    const value = configuredAdminUrl || configuredDatabaseUrl || DEFAULT_ADMIN_URL;
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${source} must be a valid PostgreSQL URL`);
    }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
        throw new Error(`${source} must use the postgres or postgresql protocol`);
    }
    if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
        throw new Error(`${source} must target the local loopback interface`);
    }
    return { enabled: true, adminUrl: parsed.toString(), source };
}

function postgresIntegrationEnabled(environment = process.env) {
    return resolvePostgresTestConfig(environment).enabled;
}

function postgresIntegrationSkipReason(environment = process.env) {
    return postgresIntegrationEnabled(environment) ? false : DISABLED_REASON;
}

function assertSafePostgresTestDatabaseName(name) {
    if (!DATABASE_NAME.test(name) || !name.startsWith('ims_test_')) {
        throw new Error(`Invalid PostgreSQL test database name: ${name}`);
    }
    return name;
}

function createPostgresTestDatabaseName(label, options = {}) {
    const normalized = String(label)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24) || 'database';
    const pid = String(options.pid ?? process.pid).replace(/\D/g, '').slice(-10) || '0';
    const entropy = options.entropy ?? crypto.randomBytes(6).toString('hex');
    const name = `ims_test_${normalized}_${pid}_${entropy}`;
    assertSafePostgresTestDatabaseName(name);
    return name;
}

function quoteIdentifier(name) {
    return `"${assertSafePostgresTestDatabaseName(name)}"`;
}

function databaseUrl(adminUrl, databaseName) {
    const parsed = new URL(adminUrl);
    parsed.pathname = `/${assertSafePostgresTestDatabaseName(databaseName)}`;
    return parsed.toString();
}

function connectionOptions(connectionString, overrides = {}) {
    return { ...CONNECTION_OPTIONS, ...overrides, connectionString };
}

function closeConnection(connection) {
    if (typeof connection.close === 'function') return connection.close();
    if (typeof connection.end === 'function') return connection.end();
    throw new Error('Managed PostgreSQL test connection must expose close() or end()');
}

function aggregateErrors(errors, message) {
    if (!errors.length) return;
    if (errors.length === 1) throw errors[0];
    throw new AggregateError(errors, message);
}

function createPostgresTestAllocator(options = {}) {
    const config = resolvePostgresTestConfig(options.environment);
    const createAdminPool = options.createAdminPool ?? ((poolOptions) => {
        const { Pool } = require('pg');
        return new Pool(poolOptions);
    });
    const migrate = options.migratePostgres ?? ((migrationOptions) => {
        const { migratePostgres } = require('../scripts/migration/postgres-migrations.js');
        return migratePostgres(migrationOptions);
    });
    const createName = options.createDatabaseName ?? createPostgresTestDatabaseName;
    let adminPool;
    let templatePromise;
    let templateName;
    let closePromise;
    let closing = false;
    let closed = false;
    const allocations = new Set();
    const createdDatabases = new Set();
    const inFlightAllocations = new Set();

    function getAdminPool() {
        if (closed) throw new Error('PostgreSQL test allocator is closed');
        if (!config.enabled || !config.adminUrl) throw new Error(DISABLED_REASON);
        adminPool ??= createAdminPool({
            connectionString: config.adminUrl,
            max: 4,
            connectionTimeoutMillis: 5_000,
            idleTimeoutMillis: 5_000,
            allowExitOnIdle: true,
            application_name: 'imsweb-postgres-test-admin'
        });
        return adminPool;
    }

    async function forceDrop(name) {
        if (!createdDatabases.has(name)) return;
        await getAdminPool().query(
            `DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`
        );
        createdDatabases.delete(name);
    }

    async function createDatabase(name, template) {
        const templateSql = template
            ? ` TEMPLATE ${quoteIdentifier(template)}`
            : ' TEMPLATE template0';
        const pool = getAdminPool();
        createdDatabases.add(name);
        try {
            await pool.query(
                `CREATE DATABASE ${quoteIdentifier(name)}${templateSql}`
            );
        } catch (error) {
            if (error?.code === '42P04') {
                createdDatabases.delete(name);
            }
            throw error;
        }
    }

    async function ensureHeadTemplate() {
        if (!templatePromise) {
            templateName = createName('template_head');
            templatePromise = (async () => {
                try {
                    await createDatabase(templateName);
                    await migrate({
                        connectionString: databaseUrl(config.adminUrl, templateName)
                    });
                } catch (error) {
                    const errors = [error];
                    await forceDrop(templateName).catch((cleanupError) => {
                        errors.push(cleanupError);
                    });
                    templatePromise = undefined;
                    aggregateErrors(errors, 'Failed to prepare PostgreSQL test template');
                }
            })();
        }
        await templatePromise;
        return templateName;
    }

    async function allocateDatabase(allocationOptions) {
        if (!config.enabled || !config.adminUrl) throw new Error(DISABLED_REASON);
        const name = createName(allocationOptions.label ?? 'database');
        const customCatalog = allocationOptions.migrationsPath !== undefined;
        let allocation;
        try {
            if (customCatalog) {
                await createDatabase(name);
                await migrate({
                    connectionString: databaseUrl(config.adminUrl, name),
                    migrationsPath: allocationOptions.migrationsPath
                });
            } else {
                await createDatabase(name, await ensureHeadTemplate());
            }

            const url = databaseUrl(config.adminUrl, name);
            const connections = [];
            const pendingConnections = new Set();
            const pendingCleanupErrors = [];
            let allocationClosing = false;
            let allocationClosed = false;
            let allocationClosePromise;

            allocation = {
                databaseName: name,
                databaseUrl: url,
                registerConnection(connection, close) {
                    if (allocationClosing || allocationClosed) {
                        throw new Error('PostgreSQL test database is closed');
                    }
                    connections.push({
                        connection,
                        close: close ?? (() => closeConnection(connection))
                    });
                    return connection;
                },
                async openConnection(factory, overrides) {
                    if (allocationClosing || allocationClosed) {
                        throw new Error('PostgreSQL test database is closed');
                    }
                    let operation;
                    operation = (async () => {
                        const connection = await factory(connectionOptions(url, overrides));
                        if (allocationClosing || allocationClosed) {
                            const closedError = new Error('PostgreSQL test database is closed');
                            try {
                                await closeConnection(connection);
                            } catch (cleanupError) {
                                pendingCleanupErrors.push(cleanupError);
                                throw new AggregateError(
                                    [closedError, cleanupError],
                                    'PostgreSQL connection opened during database cleanup'
                                );
                            }
                            throw closedError;
                        }
                        return allocation.registerConnection(connection);
                    })();
                    pendingConnections.add(operation);
                    try {
                        return await operation;
                    } finally {
                        pendingConnections.delete(operation);
                    }
                },
                close() {
                    if (allocationClosed) return Promise.resolve();
                    if (allocationClosePromise) return allocationClosePromise;
                    allocationClosing = true;
                    allocationClosePromise = (async () => {
                        const errors = [];
                        await Promise.allSettled([...pendingConnections]);
                        errors.push(...pendingCleanupErrors.splice(0));
                        for (let index = connections.length - 1; index >= 0; index -= 1) {
                            const managed = connections[index];
                            try {
                                await Promise.resolve().then(() => managed.close());
                                connections.splice(index, 1);
                            } catch (error) {
                                errors.push(error);
                            }
                        }
                        await forceDrop(name).catch((error) => errors.push(error));
                        if (connections.length === 0 && !createdDatabases.has(name)) {
                            allocationClosed = true;
                            allocations.delete(allocation);
                        }
                        aggregateErrors(
                            errors,
                            `Failed to clean PostgreSQL test database ${name}`
                        );
                    })();
                    allocationClosePromise.finally(() => {
                        if (!allocationClosed) allocationClosePromise = undefined;
                    }).catch(() => undefined);
                    return allocationClosePromise;
                }
            };
            allocations.add(allocation);
            return allocation;
        } catch (error) {
            const errors = [error];
            await forceDrop(name).catch((cleanupError) => errors.push(cleanupError));
            aggregateErrors(errors, `Failed to allocate PostgreSQL test database ${name}`);
        }
    }

    function allocate(allocationOptions = {}) {
        if (closing || closed) {
            return Promise.reject(new Error('PostgreSQL test allocator is closed'));
        }
        let operation;
        operation = allocateDatabase(allocationOptions).finally(() => {
            inFlightAllocations.delete(operation);
        });
        inFlightAllocations.add(operation);
        return operation;
    }

    function close() {
        if (closed) return Promise.resolve();
        if (closePromise) return closePromise;
        closing = true;
        closePromise = (async () => {
            await Promise.allSettled([...inFlightAllocations]);
            let cleanupErrors = [];
            for (let attempt = 0; attempt < 2; attempt += 1) {
                const attemptErrors = [];
                for (const allocation of [...allocations].reverse()) {
                    await allocation.close().catch((error) => attemptErrors.push(error));
                }
                for (const name of [...createdDatabases].reverse()) {
                    await forceDrop(name).catch((error) => attemptErrors.push(error));
                }
                cleanupErrors = attemptErrors;
                if (allocations.size === 0 && createdDatabases.size === 0) break;
            }
            if (adminPool) {
                try {
                    await adminPool.end();
                    adminPool = undefined;
                } catch (error) {
                    cleanupErrors.push(error);
                }
            }
            if (allocations.size === 0 && createdDatabases.size === 0 && !adminPool) {
                closed = true;
            }
            aggregateErrors(cleanupErrors, 'Failed to close PostgreSQL test allocator');
        })();
        closePromise.finally(() => {
            if (!closed) closePromise = undefined;
        }).catch(() => undefined);
        return closePromise;
    }

    return { config, allocate, close };
}

let sharedAllocator;

function getSharedPostgresTestAllocator() {
    sharedAllocator ??= createPostgresTestAllocator();
    return sharedAllocator;
}

async function closeSharedPostgresTestAllocator() {
    if (!sharedAllocator) return;
    const allocator = sharedAllocator;
    sharedAllocator = undefined;
    await allocator.close();
}

module.exports = {
    DEFAULT_ADMIN_URL,
    DISABLED_REASON,
    assertSafePostgresTestDatabaseName,
    closeSharedPostgresTestAllocator,
    connectionOptions,
    createPostgresTestAllocator,
    createPostgresTestDatabaseName,
    getSharedPostgresTestAllocator,
    postgresIntegrationEnabled,
    postgresIntegrationSkipReason,
    resolvePostgresTestConfig
};
