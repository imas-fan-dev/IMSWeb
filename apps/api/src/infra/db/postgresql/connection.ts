import {
    Pool,
    type PoolClient,
    type PoolConfig,
    type QueryResult,
    type QueryResultRow,
} from "pg";
import type {
    ManagedSqlDatabase,
    SqlDatabase,
    SqlResult,
    SqlStatement,
} from "@/infra/db/sql/database";

interface QueryExecutor {
    query(sql: string, values?: unknown[]): Promise<QueryResult>;
}

export type PostgresPool = QueryExecutor & {
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
    on?(event: "error", listener: (error: Error) => void): PostgresPool;
};

interface TranslatedSql {
    sql: string;
    parameters: number;
}

function dollarQuoteAt(sql: string, index: number): string | null {
    return (
        sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0] ?? null
    );
}

export function translatePostgresParameters(sql: string): TranslatedSql {
    let output = "";
    let parameters = 0;
    let index = 0;
    let state:
        | "normal"
        | "single"
        | "double"
        | "line-comment"
        | "block-comment" = "normal";
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
        if (state === "normal") {
            const tag = current === "$" ? dollarQuoteAt(sql, index) : null;
            if (tag) {
                dollarTag = tag;
                output += tag;
                index += tag.length;
                continue;
            }
            if (current === "'") state = "single";
            else if (current === '"') state = "double";
            else if (current === "-" && next === "-") state = "line-comment";
            else if (current === "/" && next === "*") {
                state = "block-comment";
                blockDepth = 1;
            } else if (current === "?") {
                parameters += 1;
                output += `$${parameters}`;
                index += 1;
                continue;
            }
        } else if (state === "single") {
            if (current === "'" && next === "'") {
                output += "''";
                index += 2;
                continue;
            }
            if (current === "'") state = "normal";
        } else if (state === "double") {
            if (current === '"' && next === '"') {
                output += '""';
                index += 2;
                continue;
            }
            if (current === '"') state = "normal";
        } else if (state === "line-comment") {
            if (current === "\n") state = "normal";
        } else if (current === "/" && next === "*") {
            blockDepth += 1;
            output += "/*";
            index += 2;
            continue;
        } else if (current === "*" && next === "/") {
            blockDepth -= 1;
            output += "*/";
            index += 2;
            if (!blockDepth) state = "normal";
            continue;
        }
        output += current;
        index += 1;
    }
    return { sql: output, parameters };
}

function normalizedRows(result: QueryResult): QueryResultRow[] {
    const bigintFields = new Set(
        result.fields
            .filter((field) => field.dataTypeID === 20)
            .map((field) => field.name),
    );
    if (!bigintFields.size) return result.rows;
    return result.rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([key, value]) => {
                if (!bigintFields.has(key) || typeof value !== "string")
                    return [key, value];
                const number = Number(value);
                return [key, Number.isSafeInteger(number) ? number : value];
            }),
        ),
    );
}

class PostgresStatement implements SqlStatement {
    private values: readonly unknown[] = [];

    constructor(
        readonly connection: PostgresConnection,
        readonly executor: QueryExecutor,
        readonly sql: string,
        readonly parameterCount: number,
    ) {}

    bind(...values: unknown[]): SqlStatement {
        const statement = new PostgresStatement(
            this.connection,
            this.executor,
            this.sql,
            this.parameterCount,
        );
        statement.values = values;
        return statement;
    }

    private async query(executor = this.executor): Promise<QueryResult> {
        if (this.values.length !== this.parameterCount) {
            throw new Error(
                `PostgreSQL statement expected ${this.parameterCount} parameters, got ${this.values.length}`,
            );
        }
        return executor.query(this.sql, [...this.values]);
    }

    async first<Value = Record<string, unknown>>(
        column?: string,
    ): Promise<Value | null> {
        const result = await this.query();
        const row = normalizedRows(result)[0];
        if (!row) return null;
        return ((column === undefined ? row : row[column]) as Value) ?? null;
    }

    async all<Row = Record<string, unknown>>(): Promise<SqlResult<Row>> {
        return this.result(await this.query());
    }

    async run<Row = Record<string, unknown>>(): Promise<SqlResult<Row>> {
        return this.result(await this.query());
    }

    runWith<Row = Record<string, unknown>>(
        executor: QueryExecutor,
    ): Promise<SqlResult<Row>> {
        return this.query(executor).then((result) => this.result<Row>(result));
    }

    private result<Row>(result: QueryResult): SqlResult<Row> {
        const rows = normalizedRows(result) as Row[];
        const firstId =
            rows[0] && typeof rows[0] === "object"
                ? (rows[0] as Record<string, unknown>).id
                : undefined;
        return {
            results: rows,
            success: true,
            meta: {
                changes: result.rowCount ?? 0,
                ...(typeof firstId === "number"
                    ? { last_row_id: firstId }
                    : {}),
            },
        };
    }
}

class PostgresTransactionDatabase implements SqlDatabase {
    constructor(
        private readonly connection: PostgresConnection,
        private readonly client: PoolClient,
    ) {}

    prepare(sql: string): SqlStatement {
        return this.connection.statement(sql, this.client);
    }

    async batch<Row = Record<string, unknown>>(
        statements: SqlStatement[],
    ): Promise<SqlResult<Row>[]> {
        return this.connection.runBatch<Row>(statements, this.client);
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

export function postgresPoolConfig(
    options: PostgresConnectionOptions,
): PoolConfig {
    return {
        connectionString: options.connectionString,
        max: options.maxConnections,
        idleTimeoutMillis: options.idleTimeoutMs,
        connectionTimeoutMillis: options.connectionTimeoutMs,
        statement_timeout: options.statementTimeoutMs,
        idle_in_transaction_session_timeout: options.idleInTransactionTimeoutMs,
        application_name: "imsweb-api",
        allowExitOnIdle: true,
    };
}

export class PostgresConnection implements ManagedSqlDatabase {
    private closing?: Promise<void>;

    constructor(readonly pool: PostgresPool) {}

    static create(options: PostgresConnectionOptions): PostgresConnection {
        const pool = new Pool(postgresPoolConfig(options)) as PostgresPool;
        pool.on?.("error", (error) => {
            console.error(
                JSON.stringify({
                    event: "postgres_pool_error",
                    error: error.message,
                }),
            );
        });
        return new PostgresConnection(pool);
    }

    prepare(sql: string): SqlStatement {
        return this.statement(sql, this.pool);
    }

    statement(sql: string, executor: QueryExecutor): SqlStatement {
        const translated = translatePostgresParameters(sql);
        return new PostgresStatement(
            this,
            executor,
            translated.sql,
            translated.parameters,
        );
    }

    async runBatch<Row = Record<string, unknown>>(
        statements: SqlStatement[],
        executor: QueryExecutor,
    ): Promise<SqlResult<Row>[]> {
        const postgresStatements = statements.map((statement) => {
            if (
                !(statement instanceof PostgresStatement) ||
                statement.connection !== this
            ) {
                throw new Error(
                    "PostgreSQL batch contains a statement from another database",
                );
            }
            return statement;
        });
        const results: SqlResult<Row>[] = [];
        for (const statement of postgresStatements) {
            results.push(await statement.runWith<Row>(executor));
        }
        return results;
    }

    async batch<Row = Record<string, unknown>>(
        statements: SqlStatement[],
    ): Promise<SqlResult<Row>[]> {
        if (!statements.length) return [];
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const results = await this.runBatch<Row>(statements, client);
            await client.query("COMMIT");
            return results;
        } catch (error) {
            await client.query("ROLLBACK").catch(() => undefined);
            throw error;
        } finally {
            client.release();
        }
    }

    async executeScript(sql: string): Promise<void> {
        await this.pool.query(sql);
    }

    async transaction<Value>(
        operation: (database: SqlDatabase) => Promise<Value>,
    ): Promise<Value> {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const result = await operation(
                new PostgresTransactionDatabase(this, client),
            );
            await client.query("COMMIT");
            return result;
        } catch (error) {
            await client.query("ROLLBACK").catch(() => undefined);
            throw error;
        } finally {
            client.release();
        }
    }

    close(): Promise<void> {
        this.closing ??= this.pool.end();
        return this.closing;
    }
}
