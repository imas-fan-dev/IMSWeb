import type {
    NewPlatformRefreshSessionInput,
    NewPlatformAccountInput,
    PlatformAccountRecord,
    PlatformAccountRepository,
    PlatformAccountWithProfile,
    PlatformProfileRecord,
    PlatformRefreshSessionRecord,
    PlatformSecurityEventInput
} from '@/ports/repositories';
import type { ManagedSqlDatabase, SqlSchemaStrategy } from '@/infra/db/sql/database';
import { executeSql, queryOne, sqlStatement } from '@/infra/db/sql/query';

const ACCOUNT_COLUMNS = `id, status, token_version, created_at, updated_at,
    deleted_at`;
const REFRESH_SESSION_COLUMNS = `id, account_id, token_hash, previous_token_hash,
    csrf_hash, expires_at, created_at, updated_at, revoked_at`;

interface PlatformAccountProfileRow extends PlatformAccountRecord {
    profile_account_id: string;
    profile_display_name: string;
    profile_avatar_object_key: string | null;
    profile_avatar_external_url: string | null;
    profile_home_city: string | null;
    profile_bio: string;
    profile_updated_at: number;
}

function accountWithProfile(row: PlatformAccountProfileRow): PlatformAccountWithProfile {
    const account: PlatformAccountRecord = {
        id: row.id,
        status: row.status,
        token_version: row.token_version,
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at
    };
    const profile: PlatformProfileRecord = {
        account_id: row.profile_account_id,
        display_name: row.profile_display_name,
        avatar_object_key: row.profile_avatar_object_key,
        avatar_external_url: row.profile_avatar_external_url,
        home_city: row.profile_home_city,
        bio: row.profile_bio,
        updated_at: row.profile_updated_at
    };
    return { account, profile };
}

function securityEventValues(event: PlatformSecurityEventInput): unknown[] {
    return [
        event.id,
        event.accountId,
        event.eventType,
        event.requestId,
        event.ipAddress,
        event.userAgent,
        event.metadataJson,
        event.createdAt
    ];
}

function conditionalSecurityEventValues(event: PlatformSecurityEventInput): unknown[] {
    return [
        event.id,
        event.eventType,
        event.requestId,
        event.ipAddress,
        event.userAgent,
        event.metadataJson,
        event.createdAt
    ];
}

function securityEventInsertSql(): string {
    return `INSERT INTO platform_security_events
        (id, account_id, event_type, request_id, ip_address, user_agent,
         metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
}

export class SqlPlatformAccountRepository implements PlatformAccountRepository {
    private initialized?: Promise<void>;
    private writeTail: Promise<void> = Promise.resolve();

    constructor(
        private readonly database: ManagedSqlDatabase,
        private readonly schema: SqlSchemaStrategy
    ) {}

    initialize(): Promise<void> {
        this.initialized ??= this.schema.initializePlatform(this.database);
        return this.initialized;
    }

    close(): Promise<void> {
        return this.database.close();
    }

    private serializeWrite<Value>(operation: () => Promise<Value>): Promise<Value> {
        const result = this.writeTail.then(operation, operation);
        this.writeTail = result.then(() => undefined, () => undefined);
        return result;
    }

    async createAccountWithProfile(
        input: NewPlatformAccountInput
    ): Promise<PlatformAccountWithProfile> {
        await this.serializeWrite(() => this.database.batch([
            sqlStatement(
                this.database,
                `INSERT INTO platform_accounts
                    (id, status, token_version, created_at, updated_at, deleted_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    input.id,
                    input.status,
                    input.tokenVersion,
                    input.createdAt,
                    input.updatedAt,
                    input.deletedAt
                ]
            ),
            sqlStatement(
                this.database,
                `INSERT INTO platform_profiles
                    (account_id, display_name, avatar_object_key,
                     avatar_external_url, home_city, bio, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    input.id,
                    input.profile.displayName,
                    input.profile.avatarObjectKey,
                    input.profile.avatarExternalUrl,
                    input.profile.homeCity,
                    input.profile.bio,
                    input.profile.updatedAt
                ]
            )
        ]));
        const created = await this.findAccountWithProfileById(input.id);
        if (!created) throw new Error('Platform account was not created');
        return created;
    }

    findAccountById(id: string): Promise<PlatformAccountRecord | null> {
        return queryOne<PlatformAccountRecord>(
            this.database,
            `SELECT ${ACCOUNT_COLUMNS} FROM platform_accounts WHERE id=?`,
            [id]
        );
    }

    async findAccountWithProfileById(
        id: string
    ): Promise<PlatformAccountWithProfile | null> {
        const row = await queryOne<PlatformAccountProfileRow>(
            this.database,
            `SELECT accounts.id, accounts.status, accounts.token_version,
                    accounts.created_at, accounts.updated_at, accounts.deleted_at,
                    profiles.account_id AS profile_account_id,
                    profiles.display_name AS profile_display_name,
                    profiles.avatar_object_key AS profile_avatar_object_key,
                    profiles.avatar_external_url AS profile_avatar_external_url,
                    profiles.home_city AS profile_home_city,
                    profiles.bio AS profile_bio,
                    profiles.updated_at AS profile_updated_at
             FROM platform_accounts accounts
             JOIN platform_profiles profiles ON profiles.account_id=accounts.id
             WHERE accounts.id=?`,
            [id]
        );
        return row ? accountWithProfile(row) : null;
    }

    async createRefreshSession(input: NewPlatformRefreshSessionInput): Promise<void> {
        await this.serializeWrite(() => this.database.batch([
            sqlStatement(
                this.database,
                `INSERT INTO platform_refresh_sessions
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
                    input.createdAt
                ]
            ),
            sqlStatement(
                this.database,
                securityEventInsertSql(),
                securityEventValues(input.event)
            )
        ]));
    }

    findRefreshSessionById(id: string): Promise<PlatformRefreshSessionRecord | null> {
        return queryOne<PlatformRefreshSessionRecord>(
            this.database,
            `SELECT ${REFRESH_SESSION_COLUMNS}
             FROM platform_refresh_sessions WHERE id=?`,
            [id]
        );
    }

    findRefreshSessionByTokenHash(
        tokenHash: string
    ): Promise<PlatformRefreshSessionRecord | null> {
        return queryOne<PlatformRefreshSessionRecord>(
            this.database,
            `SELECT ${REFRESH_SESSION_COLUMNS}
             FROM platform_refresh_sessions
             WHERE token_hash=? OR previous_token_hash=?
             ORDER BY CASE WHEN token_hash=? THEN 0 ELSE 1 END
             LIMIT 1`,
            [tokenHash, tokenHash, tokenHash]
        );
    }

    async rotateRefreshSession(input: {
        id: string;
        currentTokenHash: string;
        nextTokenHash: string;
        nextCsrfHash: string;
        nextExpiresAt: number;
        updatedAt: number;
        event: PlatformSecurityEventInput;
    }): Promise<boolean> {
        const results = await this.serializeWrite(() => this.database.batch([
            sqlStatement(
                this.database,
                `UPDATE platform_refresh_sessions
                 SET previous_token_hash=token_hash, token_hash=?, csrf_hash=?,
                     expires_at=?, updated_at=?
                 WHERE id=? AND token_hash=? AND revoked_at IS NULL AND expires_at>?`,
                [
                    input.nextTokenHash,
                    input.nextCsrfHash,
                    input.nextExpiresAt,
                    input.updatedAt,
                    input.id,
                    input.currentTokenHash,
                    input.updatedAt
                ]
            ),
            sqlStatement(
                this.database,
                `INSERT INTO platform_security_events
                    (id, account_id, event_type, request_id, ip_address, user_agent,
                     metadata_json, created_at)
                 SELECT ?, account_id, ?, ?, ?, ?, ?, ?
                 FROM platform_refresh_sessions
                 WHERE id=? AND account_id=? AND token_hash=?
                   AND previous_token_hash=? AND csrf_hash=? AND expires_at=?
                   AND updated_at=? AND revoked_at IS NULL`,
                [
                    ...conditionalSecurityEventValues(input.event),
                    input.id,
                    input.event.accountId,
                    input.nextTokenHash,
                    input.currentTokenHash,
                    input.nextCsrfHash,
                    input.nextExpiresAt,
                    input.updatedAt
                ]
            )
        ]));
        return results[0]?.meta.changes === 1;
    }

    async revokeRefreshSession(input: {
        id: string;
        accountId: string;
        revokedAt: number;
        event: PlatformSecurityEventInput;
    }): Promise<boolean> {
        const results = await this.serializeWrite(() => this.database.batch([
            sqlStatement(
                this.database,
                `INSERT INTO platform_security_events
                    (id, account_id, event_type, request_id, ip_address, user_agent,
                     metadata_json, created_at)
                 SELECT ?, account_id, ?, ?, ?, ?, ?, ?
                 FROM platform_refresh_sessions
                 WHERE id=? AND account_id=? AND revoked_at IS NULL`,
                [
                    ...conditionalSecurityEventValues(input.event),
                    input.id,
                    input.accountId
                ]
            ),
            sqlStatement(
                this.database,
                `UPDATE platform_refresh_sessions
                 SET revoked_at=?, updated_at=?
                 WHERE id=? AND account_id=? AND revoked_at IS NULL`,
                [input.revokedAt, input.revokedAt, input.id, input.accountId]
            )
        ]));
        return results[1]?.meta.changes === 1;
    }

    async revokeRefreshSessionForReplay(input: {
        id: string;
        accountId: string;
        replayedTokenHash: string;
        revokedAt: number;
        event: PlatformSecurityEventInput;
    }): Promise<boolean> {
        const results = await this.serializeWrite(() => this.database.batch([
            sqlStatement(
                this.database,
                `INSERT INTO platform_security_events
                    (id, account_id, event_type, request_id, ip_address, user_agent,
                     metadata_json, created_at)
                 SELECT ?, account_id, ?, ?, ?, ?, ?, ?
                 FROM platform_refresh_sessions
                 WHERE id=? AND account_id=? AND previous_token_hash=?
                   AND revoked_at IS NULL`,
                [
                    ...conditionalSecurityEventValues(input.event),
                    input.id,
                    input.accountId,
                    input.replayedTokenHash
                ]
            ),
            sqlStatement(
                this.database,
                `UPDATE platform_refresh_sessions
                 SET revoked_at=?, updated_at=?
                 WHERE id=? AND account_id=? AND previous_token_hash=?
                   AND revoked_at IS NULL`,
                [
                    input.revokedAt,
                    input.revokedAt,
                    input.id,
                    input.accountId,
                    input.replayedTokenHash
                ]
            )
        ]));
        return results[1]?.meta.changes === 1;
    }

    async deleteExpiredRefreshSessions(now: number): Promise<void> {
        await this.serializeWrite(async () => {
            await executeSql(
                this.database,
                'DELETE FROM platform_refresh_sessions WHERE expires_at<=?',
                [now]
            );
        });
    }
}
