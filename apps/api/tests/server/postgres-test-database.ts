import { after, test as nodeTest, type TestContext } from 'node:test';
import {
    PostgresConnection,
    type PostgresConnectionOptions
} from '@/infra/db/postgresql/connection';
import {
    closeSharedPostgresTestAllocator,
    connectionOptions,
    getSharedPostgresTestAllocator,
    postgresIntegrationEnabled,
    type PostgresTestDatabase
} from '../postgres-test-lifecycle.js';

const allocations = new WeakMap<PostgresConnection, PostgresTestDatabase>();

export const postgresTest: typeof nodeTest = (
    postgresIntegrationEnabled() ? nodeTest : nodeTest.skip
) as typeof nodeTest;

function createConnection(database: PostgresTestDatabase): PostgresConnection {
    const options = connectionOptions(database.databaseUrl) as PostgresConnectionOptions;
    const connection = database.registerConnection(PostgresConnection.create(options));
    allocations.set(connection, database);
    return connection;
}

export async function createPostgresTestDatabase(
    t: TestContext,
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
    t.after(() => database.close());
    return connection;
}

export function connectPostgresTestDatabase(
    _t: TestContext,
    connection: PostgresConnection
): PostgresConnection {
    const database = allocations.get(connection);
    if (!database) throw new Error('Unknown PostgreSQL test database');
    return createConnection(database);
}

after(() => closeSharedPostgresTestAllocator());
