export interface NodeDatabaseConfig {
    connectionString: string;
    maxConnections: number;
    idleTimeoutMs: number;
    connectionTimeoutMs: number;
    statementTimeoutMs: number;
    idleInTransactionTimeoutMs: number;
}

function optionalValue(environment: NodeJS.ProcessEnv, name: string): string | undefined {
    const value = environment[name]?.trim();
    return value || undefined;
}

function boundedInteger(
    environment: NodeJS.ProcessEnv,
    name: string,
    fallback: number,
    minimum: number,
    maximum: number
): number {
    const raw = optionalValue(environment, name);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return value;
}

function postgresUrl(environment: NodeJS.ProcessEnv): string {
    const connectionString = optionalValue(environment, 'DATABASE_URL');
    if (!connectionString) {
        throw new Error('DATABASE_URL is required');
    }
    let parsed: URL;
    try {
        parsed = new URL(connectionString);
    } catch {
        throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
    }
    if (
        !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
        !parsed.hostname ||
        !parsed.pathname ||
        parsed.pathname === '/'
    ) {
        throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
    }
    return connectionString;
}

export function parseNodeDatabaseConfig(
    environment: NodeJS.ProcessEnv
): NodeDatabaseConfig {
    return {
        connectionString: postgresUrl(environment),
        maxConnections: boundedInteger(environment, 'IMS_PG_POOL_MAX', 10, 1, 100),
        idleTimeoutMs: boundedInteger(environment, 'IMS_PG_IDLE_TIMEOUT_MS', 30_000, 1_000, 600_000),
        connectionTimeoutMs: boundedInteger(
            environment,
            'IMS_PG_CONNECTION_TIMEOUT_MS',
            5_000,
            100,
            120_000
        ),
        statementTimeoutMs: boundedInteger(
            environment,
            'IMS_PG_STATEMENT_TIMEOUT_MS',
            30_000,
            1_000,
            600_000
        ),
        idleInTransactionTimeoutMs: boundedInteger(
            environment,
            'IMS_PG_IDLE_TRANSACTION_TIMEOUT_MS',
            30_000,
            1_000,
            600_000
        )
    };
}
