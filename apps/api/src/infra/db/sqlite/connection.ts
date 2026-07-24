import sqlite3 from 'sqlite3';
import type {
    ManagedSqlDatabase,
    SqlResult,
    SqlStatement
} from '@/infra/db/sql/database';

export interface SqliteRunResult {
    lastID: number;
    changes: number;
}

class SqliteStatement implements SqlStatement {
    private values: readonly unknown[] = [];

    constructor(
        private readonly connection: SqliteConnection,
        private readonly sql: string
    ) {}

    bind(...values: unknown[]): SqlStatement {
        const statement = new SqliteStatement(this.connection, this.sql);
        statement.values = values;
        return statement;
    }

    async first<Value = Record<string, unknown>>(column?: string): Promise<Value | null> {
        const row = await this.connection.get<Record<string, unknown>>(this.sql, this.values);
        if (!row) return null;
        return (column === undefined ? row : row[column]) as Value ?? null;
    }

    async all<Row = Record<string, unknown>>(): Promise<SqlResult<Row>> {
        const rows = await this.connection.all<Row>(this.sql, this.values);
        return { results: rows, success: true, meta: { changes: 0 } };
    }

    async run<Row = Record<string, unknown>>(): Promise<SqlResult<Row>> {
        const result = await this.connection.run(this.sql, this.values);
        return {
            results: [],
            success: true,
            meta: { changes: result.changes, last_row_id: result.lastID }
        };
    }
}

export class SqliteConnection implements ManagedSqlDatabase {
    readonly dialect = 'sqlite' as const;
    readonly database: sqlite3.Database;
    private closing?: Promise<void>;

    constructor(filename: string) {
        sqlite3.verbose();
        this.database = new sqlite3.Database(filename);
    }

    prepare(sql: string): SqlStatement {
        return new SqliteStatement(this, sql);
    }

    async batch<Row = Record<string, unknown>>(
        statements: SqlStatement[]
    ): Promise<SqlResult<Row>[]> {
        await this.run('BEGIN IMMEDIATE');
        try {
            const results: SqlResult<Row>[] = [];
            for (const statement of statements) results.push(await statement.run<Row>());
            await this.run('COMMIT');
            return results;
        } catch (error) {
            await this.run('ROLLBACK').catch(() => undefined);
            throw error;
        }
    }

    executeScript(sql: string): Promise<void> {
        return this.exec(sql);
    }

    exec(sql: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.database.exec(sql, (error) => error ? reject(error) : resolve());
        });
    }

    run(sql: string, params: readonly unknown[] = []): Promise<SqliteRunResult> {
        return new Promise((resolve, reject) => {
            this.database.run(sql, params, function onRun(error) {
                if (error) reject(error);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    get<T>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
        return new Promise((resolve, reject) => {
            this.database.get<T>(sql, params, (error, row) => {
                if (error) reject(error);
                else resolve(row ?? null);
            });
        });
    }

    all<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
        return new Promise((resolve, reject) => {
            this.database.all<T>(sql, params, (error, rows) => {
                if (error) reject(error);
                else resolve(rows);
            });
        });
    }

    async transaction<T>(operation: () => Promise<T>): Promise<T> {
        await this.run('BEGIN IMMEDIATE');
        try {
            const result = await operation();
            await this.run('COMMIT');
            return result;
        } catch (error) {
            await this.run('ROLLBACK').catch(() => undefined);
            throw error;
        }
    }

    close(): Promise<void> {
        this.closing ??= new Promise((resolve, reject) => {
            this.database.close((error) => error ? reject(error) : resolve());
        });
        return this.closing;
    }
}
