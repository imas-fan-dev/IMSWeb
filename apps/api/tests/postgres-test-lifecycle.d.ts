export interface PostgresTestConfig {
    enabled: boolean;
    adminUrl: string | null;
    source: 'IMS_TEST_POSTGRES_ADMIN_URL' | 'IMS_TEST_DATABASE_URL' | 'default' | null;
}

export interface PostgresConnectionOptions {
    connectionString: string;
    maxConnections: number;
    idleTimeoutMs: number;
    connectionTimeoutMs: number;
    statementTimeoutMs: number;
    idleInTransactionTimeoutMs: number;
    [key: string]: unknown;
}

export type ManagedPostgresTestConnection =
    | { close(): void | Promise<void> }
    | { end(): void | Promise<void> };

export type PostgresConnectionOverrides = Omit<
    Partial<PostgresConnectionOptions>,
    'connectionString'
>;

export interface PostgresTestDatabase {
    databaseName: string;
    databaseUrl: string;
    registerConnection<T extends ManagedPostgresTestConnection>(connection: T): T;
    registerConnection<T extends object>(
        connection: T,
        close: () => void | Promise<void>
    ): T;
    openConnection<T extends ManagedPostgresTestConnection>(
        factory: (options: PostgresConnectionOptions) => T | Promise<T>,
        overrides?: PostgresConnectionOverrides
    ): Promise<T>;
    close(): Promise<void>;
}

export interface PostgresTestAllocator {
    config: PostgresTestConfig;
    allocate(options?: {
        label?: string;
        migrationsPath?: string;
    }): Promise<PostgresTestDatabase>;
    close(): Promise<void>;
}

export interface PostgresTestEnvironment {
    IMS_TEST_POSTGRES_ENABLED?: string;
    IMS_TEST_POSTGRES_ADMIN_URL?: string;
    IMS_TEST_DATABASE_URL?: string;
}

export const DEFAULT_ADMIN_URL: string;
export const DISABLED_REASON: string;
export function resolvePostgresTestConfig(
    environment?: PostgresTestEnvironment
): PostgresTestConfig;
export function postgresIntegrationEnabled(
    environment?: PostgresTestEnvironment
): boolean;
export function postgresIntegrationSkipReason(
    environment?: PostgresTestEnvironment
): false | string;
export function createPostgresTestDatabaseName(
    label: string,
    options?: { pid?: number; entropy?: string }
): string;
export function assertSafePostgresTestDatabaseName(name: string): string;
export function connectionOptions(
    connectionString: string,
    overrides?: PostgresConnectionOverrides
): PostgresConnectionOptions;
export function createPostgresTestAllocator(options?: {
    environment?: PostgresTestEnvironment;
    createAdminPool?: (options: Record<string, unknown>) => {
        query(sql: string, parameters?: unknown[]): Promise<unknown>;
        end(): Promise<void>;
    };
    migratePostgres?: (options: {
        connectionString: string;
        migrationsPath?: string;
    }) => Promise<unknown>;
    createDatabaseName?: (label: string) => string;
}): PostgresTestAllocator;
export function getSharedPostgresTestAllocator(): PostgresTestAllocator;
export function closeSharedPostgresTestAllocator(): Promise<void>;
