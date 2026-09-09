import { after, test as nodeTest } from 'node:test';
import {
    PostgresConnection,
    type PostgresConnectionOptions
} from '@/infra/db/postgresql/connection';
import {
    closeSharedPostgresTestAllocator,
    connectionOptions,
    getSharedPostgresTestAllocator,
    postgresIntegrationEnabled as lifecycleEnabled,
    postgresIntegrationSkipReason,
    type PostgresTestDatabase
} from '../postgres-test-lifecycle.js';
import { seedCanonicalFudabaAgencies } from './fudaba-agency-fixture';

export interface PostgresTestHarness {
    connection: PostgresConnection;
    databaseName: string;
    databaseUrl: string;
    connect(): PostgresConnection;
    registerConnection<T extends object>(
        connection: T,
        close: () => void | Promise<void>
    ): T;
    close(): Promise<void>;
}

export interface PostgresTestHarnessOptions {
    label?: string;
    migrationsPath?: string;
    seedCanonicalAgencies?: boolean;
}

export function postgresIntegrationEnabled(): boolean {
    return lifecycleEnabled();
}

export const postgresTest: typeof nodeTest = (
    postgresIntegrationEnabled() ? nodeTest : nodeTest.skip
) as typeof nodeTest;

function createConnection(database: PostgresTestDatabase): PostgresConnection {
    const options = connectionOptions(
        database.databaseUrl
    ) as PostgresConnectionOptions;
    return database.registerConnection(PostgresConnection.create(options));
}

async function closeAfterFailure(
    database: PostgresTestDatabase,
    error: unknown
): Promise<never> {
    try {
        await database.close();
    } catch (cleanupError) {
        throw new AggregateError(
            [error, cleanupError],
            'PostgreSQL test harness setup and cleanup both failed'
        );
    }
    throw error;
}

export async function createPostgresTestHarness(
    options: PostgresTestHarnessOptions = {}
): Promise<PostgresTestHarness> {
    const database = await getSharedPostgresTestAllocator().allocate({
        label: options.label ?? 'platform',
        migrationsPath: options.migrationsPath
    });
    let connection: PostgresConnection;
    try {
        connection = createConnection(database);
        if (options.seedCanonicalAgencies !== false) {
            await seedCanonicalFudabaAgencies(connection);
        }
    } catch (error) {
        return closeAfterFailure(database, error);
    }

    return {
        connection,
        databaseName: database.databaseName,
        databaseUrl: database.databaseUrl,
        connect() {
            return createConnection(database);
        },
        registerConnection(connection, close) {
            return database.registerConnection(connection, close);
        },
        close: () => database.close()
    };
}

after(() => closeSharedPostgresTestAllocator());

export { postgresIntegrationSkipReason };
