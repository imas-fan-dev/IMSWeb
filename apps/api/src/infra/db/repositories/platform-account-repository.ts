import type {
    NewPlatformAccountInput,
    PlatformAccountRecord,
    PlatformAccountRepository,
    PlatformAccountWithProfile,
    PlatformProfileRecord
} from '@/ports/repositories';
import type { ManagedSqlDatabase, SqlSchemaStrategy } from '@/infra/db/sql/database';
import { queryOne, sqlStatement } from '@/infra/db/sql/query';

const ACCOUNT_COLUMNS = `id, status, token_version, created_at, updated_at,
    deleted_at`;

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

export class SqlPlatformAccountRepository implements PlatformAccountRepository {
    private initialized?: Promise<void>;

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

    async createAccountWithProfile(
        input: NewPlatformAccountInput
    ): Promise<PlatformAccountWithProfile> {
        await this.database.batch([
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
        ]);
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
}
