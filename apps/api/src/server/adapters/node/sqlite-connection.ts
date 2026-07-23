import sqlite3 from 'sqlite3';

export interface SqliteRunResult {
    lastID: number;
    changes: number;
}

export class SqliteConnection {
    readonly database: sqlite3.Database;
    private closed = false;

    constructor(filename: string) {
        sqlite3.verbose();
        this.database = new sqlite3.Database(filename);
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
        if (this.closed) return Promise.resolve();
        this.closed = true;
        return new Promise((resolve, reject) => {
            this.database.close((error) => error ? reject(error) : resolve());
        });
    }
}
