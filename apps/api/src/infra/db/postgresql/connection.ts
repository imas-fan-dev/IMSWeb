import {
    Pool,
    type PoolClient,
    type PoolConfig,
    type QueryResult,
    type QueryResultRow
} from 'pg';
import type {
    ManagedSqlDatabase,
    SqlResult,
    SqlStatement
} from '@/infra/db/sql/database';

interface QueryExecutor {
    query(sql: string, values?: unknown[]): Promise<QueryResult>;
}

export type PostgresPool = QueryExecutor & {
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
};

interface TranslatedSql {
    sql: string;
    parameters: number;
}

function dollarQuoteAt(sql: string, index: number): string | null {
    return sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0] ?? null;
}

export function translatePostgresParameters(sql: string): TranslatedSql {
    let output = '';
    let parameters = 0;
    let index = 0;
    let state: 'normal' | 'single' | 'double' | 'line-comment' | 'block-comment' = 'normal';
    let blockDepth = 0;
    let dollarTag: string | null = null;

    while (index < sql.length) {
        if (dollarTag) {
            if (sql.startsWith(dollarTag, index)) {
                output += dollarTag;
                index += dollarTag.length;
                dollarTag = null;
            } else {
                output += sql[index++];
            }
            continue;
        }

        const current = sql[index];
        const next = sql[index + 1];
        if (state === 'normal') {
            const tag = current === '$' ? dollarQuoteAt(sql, index) : null;
            if (tag) {
                dollarTag = tag;
                output += tag;
                index += tag.length;
                continue;
            }
            if (current === "'") state = 'single';
            else if (current === '"') state = 'double';
            else if (current === '-' && next === '-') state = 'line-comment';
            else if (current === '/' && next === '*') {
                state = 'block-comment';
                blockDepth = 1;
            } else if (current === '?') {
                parameters += 1;
                output += `$${parameters}`;
                index += 1;
                continue;
            }
        } else if (state === 'single') {
            if (current === "'" && next === "'") {
                output += "''";
                index += 2;
                continue;
            }
            if (current === "'") state = 'normal';
        } else if (state === 'double') {
            if (current === '"' && next === '"') {
                output += '""';
                index += 2;
                continue;
            }
            if (current === '"') state = 'normal';
        } else if (state === 'line-comment') {
            if (current === '\n') state = 'normal';
        } else if (current === '/' && next === '*') {
            blockDepth += 1;
            output += '/*';
            index += 2;
            continue;
        } else if (current === '*' && next === '/') {
            blockDepth -= 1;
            output += '*/';
            index += 2;
            if (!blockDepth) state = 'normal';
            continue;
        }
        output += current;
        index += 1;
    }
    return { sql: output, parameters };
}

function normalizedRows(result: QueryResult): QueryResultRow[] {
    const bigintFields = new Set(
        result.fields.filter((field) => field.dataTypeID === 20).map((field) => field.name)
    );
    if (!bigintFields.size) return result.rows;
    return result.rows.map((row) => Object.fromEntries(
        Object.entries(row).map(([key, value]) => {
            if (!bigintFields.has(key) || typeof value !== 'string') return [key, value];
            const number = Number(value);
            return [key, Number.isSafeInteger(number) ? number : value];
        })
    ));
}

class PostgresStatement implements SqlStatement {
    private values: readonly unknown[] = [];

    constructor(
        readonly connection: PostgresConnection,
        readonly sql: string,
        readonly parameterCount: number
    ) {}

    bind(...values: unknown[]): SqlStatement {
        const statement = new PostgresStatement(this.connection, this.sql, this.parameterCount);
        statement.values = values;
        return statement;
    }

    private async query(executor: QueryExecutor): Promise<QueryResult> {
        if (this.values.length !== this.parameterCount) {
            throw new Error(
                `PostgreSQL statement expected ${this.parameterCount} parameters, got ${this.values.length}`
            );
        }
        return executor.query(this.sql, [...this.values]);
    }

    async first<Value = Record<string, unknown>>(column?: string): Promise<Value | null> {
        const result = await this.query(this.connection.pool);
        const row = normalizedRows(result)[0];
        if (!row) return null;
        return (column === undefined ? row : row[column]) as Value ?? null;
    }

    async all<Row = Record<string, unknown>>(): Promise<SqlResult<Row>> {
        return this.result(await this.query(this.connection.pool));
    }

    async run<Row = Record<string, unknown>>(): Promise<SqlResult<Row>> {
        return this.result(await this.query(this.connection.pool));
    }

    runWith<Row = Record<string, unknown>>(executor: QueryExecutor): Promise<SqlResult<Row>> {
        return this.query(executor).then((result) => this.result<Row>(result));
    }

    private result<Row>(result: QueryResult): SqlResult<Row> {
        const rows = normalizedRows(result) as Row[];
        const firstId = rows[0] && typeof rows[0] === 'object'
            ? (rows[0] as Record<string, unknown>).id
            : undefined;
        return {
            results: rows,
            success: true,
            meta: {
                changes: result.rowCount ?? 0,
                ...(typeof firstId === 'number' ? { last_row_id: firstId } : {})
            }
        };
    }
}

export interface PostgresConnectionOptions {
    connectionString: string;
    maxConnections: number;
    idleTimeoutMs: number;
    connectionTimeoutMs: number;
    statementTimeoutMs: number;
    idleInTransactionTimeoutMs: number;
}

export function postgresPoolConfig(options: PostgresConnectionOptions): PoolConfig {
    return {
        connectionString: options.connectionString,
        max: options.maxConnections,
        idleTimeoutMillis: options.idleTimeoutMs,
        connectionTimeoutMillis: options.connectionTimeoutMs,
        statement_timeout: options.statementTimeoutMs,
        idle_in_transaction_session_timeout: options.idleInTransactionTimeoutMs,
        application_name: 'imsweb-api',
        allowExitOnIdle: true
    };
}

export class PostgresConnection implements ManagedSqlDatabase {
    readonly dialect = 'postgresql' as const;
    private closing?: Promise<void>;

    constructor(readonly pool: PostgresPool) {}

    static create(options: PostgresConnectionOptions): PostgresConnection {
        return new PostgresConnection(new Pool(postgresPoolConfig(options)) as PostgresPool);
    }

    prepare(sql: string): SqlStatement {
        const translated = translatePostgresParameters(sql);
        return new PostgresStatement(this, translated.sql, translated.parameters);
    }

    async batch<Row = Record<string, unknown>>(
        statements: SqlStatement[]
    ): Promise<SqlResult<Row>[]> {
        if (!statements.length) return [];
        const postgresStatements = statements.map((statement) => {
            if (!(statement instanceof PostgresStatement) || statement.connection !== this) {
                throw new Error('PostgreSQL batch contains a statement from another database');
            }
            return statement;
        });
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const results: SqlResult<Row>[] = [];
            for (const statement of postgresStatements) {
                results.push(await statement.runWith<Row>(client));
            }
            await client.query('COMMIT');
            return results;
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        } finally {
            client.release();
        }
    }

    async executeScript(sql: string): Promise<void> {
        await this.pool.query(sql);
    }

    close(): Promise<void> {
        this.closing ??= this.pool.end();
        return this.closing;
    }
}
