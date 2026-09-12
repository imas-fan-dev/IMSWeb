import type {
    AdminAccountRecord,
    AdminAccountRepository,
    DeleteAdminAccountResult,
    NewAdminAccountInput,
} from '@/ports/repositories/admin';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne } from '@/infra/db/sql/query';

const BACKOFFICE_ACCOUNTS_TABLE = 'backoffice_accounts';

export class SqlAdminAccountRepository implements AdminAccountRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    async ensureSuperAdmin(username?: string): Promise<void> {
        const current = await queryAll<AdminAccountRecord>(
            this.database,
            `SELECT id, username, producername, admin_role
             FROM ${BACKOFFICE_ACCOUNTS_TABLE}
             WHERE dept='op' AND admin_role='super_admin'`,
        );
        if (current.length > 1) {
            throw new Error('Multiple super administrators are configured');
        }
        if (current.length === 1) {
            if (username && current[0]!.username !== username) {
                throw new Error(
                    'IMS_SUPER_ADMIN_USERNAME does not match the configured super administrator',
                );
            }
            return;
        }
        if (!username) {
            throw new Error(
                'IMS_SUPER_ADMIN_USERNAME is required until a super administrator is configured',
            );
        }
        const target = await queryOne<{ id: number; dept: string }>(
            this.database,
            `SELECT id, dept FROM ${BACKOFFICE_ACCOUNTS_TABLE} WHERE username=?`,
            [username],
        );
        if (!target || target.dept !== 'op') {
            throw new Error(
                'IMS_SUPER_ADMIN_USERNAME must identify an existing op account',
            );
        }
        const result = await executeSql(
            this.database,
            `UPDATE ${BACKOFFICE_ACCOUNTS_TABLE} SET admin_role='super_admin'
             WHERE id=? AND dept='op' AND admin_role='admin'`,
            [target.id],
        );
        if (result.meta.changes !== 1) {
            throw new Error('Failed to configure the super administrator');
        }
    }

    listAdminAccounts(): Promise<AdminAccountRecord[]> {
        return queryAll<AdminAccountRecord>(
            this.database,
            `SELECT id, username, producername, admin_role
             FROM ${BACKOFFICE_ACCOUNTS_TABLE}
             WHERE dept='op' AND admin_role IN ('admin', 'super_admin')
             ORDER BY CASE admin_role WHEN 'super_admin' THEN 0 ELSE 1 END, id`,
        );
    }

    async createAdminAccount(
        input: NewAdminAccountInput,
    ): Promise<AdminAccountRecord> {
        const created = await queryOne<AdminAccountRecord>(
            this.database,
            `INSERT INTO ${BACKOFFICE_ACCOUNTS_TABLE}
                (username, password, dept, producername, admin_role)
             VALUES (?, ?, 'op', ?, 'admin')
             RETURNING id, username, producername, admin_role`,
            [input.username, input.passwordHash, input.producername],
        );
        if (!created) {
            throw new Error('Failed to create administrator account');
        }
        return created;
    }

    async deleteAdminAccount(id: number): Promise<DeleteAdminAccountResult> {
        try {
            const result = await executeSql(
                this.database,
                `DELETE FROM ${BACKOFFICE_ACCOUNTS_TABLE}
                 WHERE id=? AND dept='op' AND admin_role='admin'`,
                [id],
            );
            return result.meta.changes === 1 ? 'deleted' : 'not-deletable';
        } catch (error) {
            if (this.isModerationActorReference(error)) {
                return 'moderation-history';
            }
            throw error;
        }
    }

    private isModerationActorReference(error: unknown): boolean {
        if (!(error instanceof Error)) return false;
        const databaseError = error as Error & {
            code?: string;
            constraint?: string;
        };
        if (databaseError.code === '23001' || databaseError.code === '23503') {
            return new Set([
                'fudaba_moderation_cases_backoffice_actor_fk',
                'fudaba_office_public_locations_reviewed_by_fkey',
            ]).has(databaseError.constraint ?? '');
        }
        return (
            databaseError.code?.startsWith('SQLITE_CONSTRAINT') === true &&
            /FOREIGN KEY constraint failed/i.test(databaseError.message)
        );
    }
}
