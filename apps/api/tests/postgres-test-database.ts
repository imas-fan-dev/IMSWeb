import { afterAll, onTestFinished, test } from 'vitest';
import {
    PostgresConnection,
    type PostgresConnectionOptions
} from '@/infra/db/postgresql/connection';
import {
    closeSharedPostgresTestAllocator,
    connectionOptions,
    DISABLED_REASON,
    getSharedPostgresTestAllocator,
    postgresIntegrationEnabled,
    postgresIntegrationSkipReason,
    type PostgresTestDatabase
} from './postgres-test-lifecycle.js';

const allocations = new WeakMap<PostgresConnection, PostgresTestDatabase>();

/**
 * Vitest adapter for the shared PostgreSQL lifecycle core. The test is always
 * declared so the disabled run reports it as skipped with the shared reason
 * instead of losing the declaration to a `skip` option.
 */
export function postgresTest(
    name: string,
    body: () => void | Promise<void>
): void {
    test(name, async (context) => {
        if (!postgresIntegrationEnabled()) {
            context.skip(postgresIntegrationSkipReason() || DISABLED_REASON);
            return;
        }
        await body();
    });
}

function createConnection(database: PostgresTestDatabase): PostgresConnection {
    const options = connectionOptions(database.databaseUrl) as PostgresConnectionOptions;
    const connection = database.registerConnection(PostgresConnection.create(options));
    allocations.set(connection, database);
    return connection;
}

export async function createPostgresTestDatabase(
    label: string
): Promise<PostgresConnection> {
    const database = await getSharedPostgresTestAllocator().allocate({ label });
    let connection: PostgresConnection;
    try {
        connection = createConnection(database);
    } catch (error) {
        try {
            await database.close();
        } catch (cleanupError) {
            throw new AggregateError(
                [error, cleanupError],
                'PostgreSQL test connection setup and cleanup both failed'
            );
        }
        throw error;
    }
    // Replaces the node:test `t.after` the old TestContext adapter registered;
    // the database is dropped once the current test finishes.
    onTestFinished(() => database.close());
    return connection;
}

export function connectPostgresTestDatabase(
    connection: PostgresConnection
): PostgresConnection {
    const database = allocations.get(connection);
    if (!database) throw new Error('Unknown PostgreSQL test database');
    return createConnection(database);
}

afterAll(closeSharedPostgresTestAllocator);
