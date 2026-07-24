import type {
    SqlDatabase,
    SqlResult,
    SqlStatement
} from '@/infra/db/sql/database';

export function sqlStatement(
    database: SqlDatabase,
    sql: string,
    values: readonly unknown[] = []
): SqlStatement {
    return database.prepare(sql).bind(...values);
}

export function queryOne<Row>(
    database: SqlDatabase,
    sql: string,
    values: readonly unknown[] = []
): Promise<Row | null> {
    return sqlStatement(database, sql, values).first<Row>();
}

export async function queryAll<Row>(
    database: SqlDatabase,
    sql: string,
    values: readonly unknown[] = []
): Promise<Row[]> {
    return (await sqlStatement(database, sql, values).all<Row>()).results;
}

export function executeSql(
    database: SqlDatabase,
    sql: string,
    values: readonly unknown[] = []
): Promise<SqlResult> {
    return sqlStatement(database, sql, values).run();
}
