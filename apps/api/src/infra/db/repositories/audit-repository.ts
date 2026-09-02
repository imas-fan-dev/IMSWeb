import type {
    AuditLogInput,
    AuditRepository,
} from '@/ports/repositories/admin';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import { executeSql, queryAll } from '@/infra/db/sql/query';

export class SqlAuditRepository implements AuditRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    async insertAuditLog(input: AuditLogInput): Promise<void> {
        await executeSql(
            this.database,
            `INSERT INTO logs
                (username, producername, action, target, ip, time)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                input.username,
                input.producername,
                input.action,
                input.target,
                input.ip,
                input.time,
            ],
        );
    }

    listRecentAuditLogs(limit: number): Promise<Record<string, unknown>[]> {
        return queryAll(
            this.database,
            'SELECT * FROM logs ORDER BY id DESC LIMIT ?',
            [limit],
        );
    }
}
