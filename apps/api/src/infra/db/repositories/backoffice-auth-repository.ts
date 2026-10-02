import type {
    BackofficeAccountRecord,
    BackofficeAuthRepository,
    BackofficeRefreshSessionRecord,
    NewBackofficeRefreshSessionInput,
} from '@/ports/repositories/admin';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import { executeSql, queryOne } from '@/infra/db/sql/query';

const BACKOFFICE_ACCOUNTS_TABLE = 'backoffice_accounts';
const BACKOFFICE_REFRESH_SESSIONS_TABLE = 'backoffice_refresh_sessions';

export class SqlBackofficeAuthRepository implements BackofficeAuthRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    findUserByUsername(
        username: string,
    ): Promise<BackofficeAccountRecord | null> {
        return queryOne<BackofficeAccountRecord>(
            this.database,
            `SELECT * FROM ${BACKOFFICE_ACCOUNTS_TABLE} WHERE username=?`,
            [username],
        );
    }

    findUserById(id: number): Promise<BackofficeAccountRecord | null> {
        return queryOne<BackofficeAccountRecord>(
            this.database,
            `SELECT * FROM ${BACKOFFICE_ACCOUNTS_TABLE} WHERE id=?`,
            [id],
        );
    }

    async createRefreshSession(
        input: NewBackofficeRefreshSessionInput,
    ): Promise<void> {
        await executeSql(
            this.database,
            `INSERT INTO ${BACKOFFICE_REFRESH_SESSIONS_TABLE}
                (id, account_id, token_hash, previous_token_hash, csrf_hash,
                 expires_at, created_at, updated_at, revoked_at)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL)`,
            [
                input.id,
                input.accountId,
                input.tokenHash,
                input.csrfHash,
                input.expiresAt,
                input.createdAt,
                input.createdAt,
            ],
        );
    }

    findRefreshSessionByTokenHash(
        tokenHash: string,
    ): Promise<BackofficeRefreshSessionRecord | null> {
        return queryOne<BackofficeRefreshSessionRecord>(
            this.database,
            `SELECT id, account_id, token_hash, previous_token_hash, csrf_hash,
                    expires_at, created_at, updated_at, revoked_at
             FROM ${BACKOFFICE_REFRESH_SESSIONS_TABLE}
             WHERE token_hash=? OR previous_token_hash=?
             ORDER BY CASE WHEN token_hash=? THEN 0 ELSE 1 END
             LIMIT 1`,
            [tokenHash, tokenHash, tokenHash],
        );
    }

    async rotateRefreshSession(input: {
        id: string;
        currentTokenHash: string;
        nextTokenHash: string;
        nextExpiresAt: number;
        updatedAt: number;
    }): Promise<boolean> {
        const result = await executeSql(
            this.database,
            `UPDATE ${BACKOFFICE_REFRESH_SESSIONS_TABLE}
             SET previous_token_hash=token_hash, token_hash=?, expires_at=?, updated_at=?
             WHERE id=? AND token_hash=? AND revoked_at IS NULL AND expires_at>?`,
            [
                input.nextTokenHash,
                input.nextExpiresAt,
                input.updatedAt,
                input.id,
                input.currentTokenHash,
                input.updatedAt,
            ],
        );
        return result.meta.changes === 1;
    }

    async revokeRefreshSession(id: string, revokedAt: number): Promise<void> {
        await executeSql(
            this.database,
            `UPDATE ${BACKOFFICE_REFRESH_SESSIONS_TABLE}
             SET revoked_at=COALESCE(revoked_at, ?), updated_at=?
             WHERE id=?`,
            [revokedAt, revokedAt, id],
        );
    }

    async deleteExpiredRefreshSessions(now: number): Promise<void> {
        await executeSql(
            this.database,
            `DELETE FROM ${BACKOFFICE_REFRESH_SESSIONS_TABLE} WHERE expires_at<=?`,
            [now],
        );
    }
}
