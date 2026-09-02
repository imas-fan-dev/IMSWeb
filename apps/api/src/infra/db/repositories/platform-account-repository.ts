import type {
    CreatePlatformEmailAccountResult,
    CreateVerifiedPlatformEmailAccountResult,
    CompletePlatformPasswordResetInput,
    CompletePlatformPasswordResetResult,
    CreatePlatformOAuthAccountResult,
    DeletePlatformOAuthIdentityInput,
    DeletePlatformOAuthIdentityResult,
    IssuePlatformPasswordResetResult,
    IssuePlatformEmailVerificationResult,
    NewPlatformRefreshSessionInput,
    NewPlatformAccountInput,
    NewPlatformEmailAccountInput,
    NewPlatformOAuthAccountInput,
    NewPlatformOAuthStateInput,
    PlatformPasswordResetInput,
    NewVerifiedPlatformEmailAccountInput,
    PlatformAccountRecord,
    PlatformAccountRepository,
    PlatformAccountWithProfile,
    PlatformEmailCredentialRecord,
    PlatformEmailIdentity,
    PlatformEmailVerificationInput,
    PlatformOAuthIdentity,
    PlatformOAuthLinkRecord,
    PlatformOAuthStateRecord,
    PlatformProfileSaveResult,
    PlatformProfileRecord,
    PlatformRefreshSessionRecord,
    PlatformSecurityEventInput,
    RevokePlatformRefreshSessionsInput,
    UpdatePlatformPasswordInput,
    UpdatePlatformPasswordResult,
    UpdatePlatformProfileAvatarInput,
    UpdatePlatformProfileTextInput
} from '@/ports/repositories';
import type {
    PlatformOAuthProviderCode,
    PlatformOAuthProviderConfigRecord,
    PlatformOAuthProviderStore
} from '@/ports/oauth';
import type { ManagedSqlDatabase, SqlSchemaStrategy } from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne, sqlStatement } from '@/infra/db/sql/query';

const ACCOUNT_COLUMNS = `id, status, token_version, created_at, updated_at,
    deleted_at`;
const PROFILE_COLUMNS = `account_id, display_name, avatar_object_key,
    avatar_external_url, home_city, bio, updated_at`;
const REFRESH_SESSION_COLUMNS = `id, account_id, token_hash, previous_token_hash,
    csrf_hash, expires_at, created_at, updated_at, revoked_at, user_agent,
    ip_address, last_seen_at`;
const EMAIL_CREDENTIAL_COLUMNS = `normalized_email, account_id, algorithm,
    parameters_json, salt, password_hash, created_at, updated_at`;
const REFRESH_SESSION_LIST_LIMIT = 200;
// Bounded by UNIQUE (account_id, provider_code) in practice, but the wire
// contract caps the array, so the statement caps it too.
const OAUTH_LINK_LIST_LIMIT = 64;
const EMAIL_VERIFICATION_CLEANUP_LIMIT = 100;

interface PlatformAccountProfileRow extends PlatformAccountRecord {
    profile_account_id: string;
    profile_display_name: string;
    profile_avatar_object_key: string | null;
    profile_avatar_external_url: string | null;
    profile_home_city: string | null;
    profile_bio: string;
    profile_updated_at: number;
}

interface PlatformOAuthProviderRow {
    code: PlatformOAuthProviderConfigRecord['code'];
    display_name: string;
    icon: string;
    button_color: string;
    enabled: boolean | number | string;
    client_id_ciphertext: string | null;
    client_secret_ciphertext: string | null;
    redirect_uri: string | null;
    authorization_endpoint: string;
    token_endpoint: string;
    user_info_endpoint: string;
    scopes_json: unknown;
    token_auth_method: PlatformOAuthProviderConfigRecord['tokenAuthMethod'];
    pkce_enabled: boolean | number | string;
    profile_subject_path: string;
    profile_display_name_path: string;
    profile_display_name_fallback_path: string | null;
    profile_avatar_url_path: string | null;
    updated_at: number;
}

interface PlatformOAuthLinkRow {
    provider_code: PlatformOAuthProviderCode;
    provider_label: string;
    provider_enabled: boolean | number | string;
    provider_display_name: string;
    provider_avatar_url: string;
    created_at: number;
}

interface PlatformOAuthIdentityRow extends PlatformAccountProfileRow {
    oauth_provider_code: PlatformOAuthProviderCode;
    oauth_provider_subject: string;
    oauth_account_id: string;
    oauth_provider_display_name: string;
    oauth_provider_avatar_url: string;
    oauth_created_at: number;
    oauth_updated_at: number;
}

interface PlatformEmailIdentityRow extends PlatformAccountProfileRow {
    credential_normalized_email: string;
    credential_account_id: string;
    credential_algorithm: PlatformEmailIdentity['credential']['algorithm'];
    credential_parameters_json: string;
    credential_salt: string | null;
    credential_password_hash: string;
    credential_created_at: number;
    credential_updated_at: number;
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

function oauthIdentity(row: PlatformOAuthIdentityRow): PlatformOAuthIdentity {
    return {
        ...accountWithProfile(row),
        oauth: {
            provider_code: row.oauth_provider_code,
            provider_subject: row.oauth_provider_subject,
            account_id: row.oauth_account_id,
            provider_display_name: row.oauth_provider_display_name,
            provider_avatar_url: row.oauth_provider_avatar_url,
            created_at: row.oauth_created_at,
            updated_at: row.oauth_updated_at
        }
    };
}

function emailIdentity(row: PlatformEmailIdentityRow): PlatformEmailIdentity {
    return {
        ...accountWithProfile(row),
        credential: {
            normalized_email: row.credential_normalized_email,
            account_id: row.credential_account_id,
            algorithm: row.credential_algorithm,
            parameters_json: row.credential_parameters_json,
            salt: row.credential_salt,
            password_hash: row.credential_password_hash,
            created_at: row.credential_created_at,
            updated_at: row.credential_updated_at
        }
    };
}

function isEmailConflict(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: unknown; constraint?: unknown; message?: unknown };
    if (
        candidate.code === '23505' &&
        candidate.constraint === 'platform_email_credentials_pkey'
    ) {
        return true;
    }
    return candidate.code === 'SQLITE_CONSTRAINT' &&
        typeof candidate.message === 'string' &&
        candidate.message.includes(
            'UNIQUE constraint failed: platform_email_credentials.normalized_email'
        );
}

function isOAuthIdentityConflict(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: unknown; constraint?: unknown; message?: unknown };
    if (
        candidate.code === '23505' &&
        (candidate.constraint === 'platform_oauth_identities_pkey' ||
            candidate.constraint === 'platform_oauth_identities_account_id_provider_code_key')
    ) {
        return true;
    }
    return candidate.code === 'SQLITE_CONSTRAINT' &&
        typeof candidate.message === 'string' &&
        candidate.message.includes('platform_oauth_identities');
}

function isOAuthProviderReference(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: unknown; constraint?: unknown };
    return ['23001', '23503'].includes(String(candidate.code || '')) && new Set([
        'platform_oauth_identities_provider_code_fkey',
        'platform_oauth_states_provider_code_fkey'
    ]).has(String(candidate.constraint || ''));
}

function oauthProviderRecord(
    row: PlatformOAuthProviderRow
): PlatformOAuthProviderConfigRecord {
    let scopes: string[] = [];
    if (Array.isArray(row.scopes_json)) {
        scopes = row.scopes_json.filter(
            (scope): scope is string => typeof scope === 'string'
        );
    } else if (typeof row.scopes_json === 'string') {
        try {
            const parsed = JSON.parse(row.scopes_json) as unknown;
            if (Array.isArray(parsed)) {
                scopes = parsed.filter(
                    (scope): scope is string => typeof scope === 'string'
                );
            }
        } catch {
            scopes = [];
        }
    }
    return {
        code: row.code,
        displayName: row.display_name,
        icon: row.icon,
        buttonColor: row.button_color,
        enabled: row.enabled === true || row.enabled === 1 || row.enabled === 't',
        clientIdCiphertext: row.client_id_ciphertext,
        clientSecretCiphertext: row.client_secret_ciphertext,
        redirectUri: row.redirect_uri,
        authorizationEndpoint: row.authorization_endpoint,
        tokenEndpoint: row.token_endpoint,
        userInfoEndpoint: row.user_info_endpoint,
        scopes,
        tokenAuthMethod: row.token_auth_method,
        pkceEnabled:
            row.pkce_enabled === true || row.pkce_enabled === 1 ||
            row.pkce_enabled === 't',
        profileSubjectPath: row.profile_subject_path,
        profileDisplayNamePath: row.profile_display_name_path,
        profileDisplayNameFallbackPath: row.profile_display_name_fallback_path,
        profileAvatarUrlPath: row.profile_avatar_url_path,
        updatedAt: row.updated_at
    };
}

// Drivers disagree on how a boolean column comes back: PostgreSQL hands over a
// real boolean, SQLite an integer, and some text protocols a 't'.
function sqlBoolean(value: boolean | number | string): boolean {
    return value === true || value === 1 || value === 't';
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

// Same column order as the conditional variant, but for statements that carry
// the account id themselves instead of reading it off a session row.
function securityEventValues(
    event: PlatformSecurityEventInput,
    accountId: string
): unknown[] {
    return [
        event.id,
        accountId,
        event.eventType,
        event.requestId,
        event.ipAddress,
        event.userAgent,
        event.metadataJson,
        event.createdAt
    ];
}

export class SqlPlatformAccountRepository implements PlatformAccountRepository, PlatformOAuthProviderStore {
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

    async listOAuthProviderConfigs(): Promise<PlatformOAuthProviderConfigRecord[]> {
        const result = await sqlStatement(
            this.database,
            `SELECT code, display_name, icon, button_color, enabled,
                    client_id_ciphertext, client_secret_ciphertext, redirect_uri,
                    authorization_endpoint, token_endpoint, user_info_endpoint,
                    scopes_json, token_auth_method, pkce_enabled,
                    profile_subject_path, profile_display_name_path,
                    profile_display_name_fallback_path, profile_avatar_url_path,
                    updated_at
             FROM platform_oauth_providers
             ORDER BY sort_order, code`,
            []
        ).all<PlatformOAuthProviderRow>();
        return result.results.map(oauthProviderRecord);
    }

    async createOAuthProviderConfig(
        input: PlatformOAuthProviderConfigRecord
    ): Promise<
        | { status: 'created'; provider: PlatformOAuthProviderConfigRecord }
        | { status: 'conflict'; provider: PlatformOAuthProviderConfigRecord }
    > {
        const result = await sqlStatement(
            this.database,
            `INSERT INTO platform_oauth_providers
                (code, display_name, icon, button_color, enabled,
                 client_id_ciphertext, client_secret_ciphertext, redirect_uri,
                 authorization_endpoint, token_endpoint, user_info_endpoint,
                 scopes_json, token_auth_method, pkce_enabled,
                 profile_subject_path, profile_display_name_path,
                 profile_display_name_fallback_path, profile_avatar_url_path,
                 updated_at, sort_order)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?,
                    COALESCE(MAX(sort_order), 0) + 10
             FROM platform_oauth_providers
             ON CONFLICT (code) DO NOTHING
             RETURNING code`,
            [
                input.code,
                input.displayName,
                input.icon,
                input.buttonColor,
                input.enabled,
                input.clientIdCiphertext,
                input.clientSecretCiphertext,
                input.redirectUri,
                input.authorizationEndpoint,
                input.tokenEndpoint,
                input.userInfoEndpoint,
                JSON.stringify(input.scopes),
                input.tokenAuthMethod,
                input.pkceEnabled,
                input.profileSubjectPath,
                input.profileDisplayNamePath,
                input.profileDisplayNameFallbackPath,
                input.profileAvatarUrlPath,
                input.updatedAt
            ]
        ).all<{ code: string }>();
        const provider = (await this.listOAuthProviderConfigs()).find(
            (candidate) => candidate.code === input.code
        );
        if (!provider) throw new Error('OAuth provider was not returned after create');
        return {
            status: result.results[0] ? 'created' : 'conflict',
            provider
        };
    }

    async updateOAuthProviderConfig(
        input: PlatformOAuthProviderConfigRecord & { expectedUpdatedAt: number }
    ): Promise<
        | { status: 'saved'; provider: PlatformOAuthProviderConfigRecord }
        | { status: 'conflict'; provider: PlatformOAuthProviderConfigRecord }
        | { status: 'not-found' }
    > {
        const result = await sqlStatement(
            this.database,
            `UPDATE platform_oauth_providers
             SET display_name=?, icon=?, button_color=?, enabled=?,
                 client_id_ciphertext=?, client_secret_ciphertext=?, redirect_uri=?,
                 authorization_endpoint=?, token_endpoint=?, user_info_endpoint=?,
                 scopes_json=?::jsonb, token_auth_method=?, pkce_enabled=?,
                 profile_subject_path=?, profile_display_name_path=?,
                 profile_display_name_fallback_path=?, profile_avatar_url_path=?,
                 updated_at=?
             WHERE code=? AND updated_at=?
             RETURNING code`,
            [
                input.displayName,
                input.icon,
                input.buttonColor,
                input.enabled,
                input.clientIdCiphertext,
                input.clientSecretCiphertext,
                input.redirectUri,
                input.authorizationEndpoint,
                input.tokenEndpoint,
                input.userInfoEndpoint,
                JSON.stringify(input.scopes),
                input.tokenAuthMethod,
                input.pkceEnabled,
                input.profileSubjectPath,
                input.profileDisplayNamePath,
                input.profileDisplayNameFallbackPath,
                input.profileAvatarUrlPath,
                input.updatedAt,
                input.code,
                input.expectedUpdatedAt
            ]
        ).all<{ code: string }>();
        const current = (await this.listOAuthProviderConfigs()).find(
            (candidate) => candidate.code === input.code
        );
        if (!current) return { status: 'not-found' };
        return result.results[0]
            ? { status: 'saved', provider: current }
            : { status: 'conflict', provider: current };
    }

    async deleteOAuthProviderConfig(
        code: PlatformOAuthProviderCode,
        expectedUpdatedAt: number
    ): Promise<'deleted' | 'conflict' | 'in-use' | 'not-found'> {
        try {
            const result = await sqlStatement(
                this.database,
                `DELETE FROM platform_oauth_providers
                 WHERE code=? AND updated_at=?
                 RETURNING code`,
                [code, expectedUpdatedAt]
            ).all<{ code: string }>();
            if (result.results[0]) return 'deleted';
        } catch (error) {
            if (isOAuthProviderReference(error)) return 'in-use';
            throw error;
        }
        const current = (await this.listOAuthProviderConfigs()).find(
            (candidate) => candidate.code === code
        );
        return current ? 'conflict' : 'not-found';
    }

    async createOAuthState(input: NewPlatformOAuthStateInput): Promise<void> {
        await this.serializeWrite(() => this.database.batch([
            sqlStatement(
                this.database,
                `DELETE FROM platform_oauth_states WHERE expires_at<=?`,
                [input.createdAt]
            ),
            sqlStatement(
                this.database,
                `INSERT INTO platform_oauth_states
                    (state_hash, provider_code, intent, linking_account_id,
                     code_verifier, return_path, expires_at, created_at)
                 VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
                [
                    input.stateHash,
                    input.providerCode,
                    input.intent,
                    input.codeVerifier,
                    input.returnPath,
                    input.expiresAt,
                    input.createdAt
                ]
            )
        ]));
    }

    async consumeOAuthState(
        stateHash: string,
        providerCode: PlatformOAuthProviderCode,
        consumedAt: number
    ): Promise<PlatformOAuthStateRecord | null> {
        const result = await sqlStatement(
            this.database,
            `DELETE FROM platform_oauth_states
             WHERE state_hash=? AND provider_code=? AND intent='login'
               AND expires_at>?
             RETURNING state_hash, provider_code, intent, linking_account_id,
                       code_verifier, return_path, expires_at, created_at`,
            [stateHash, providerCode, consumedAt]
        ).all<PlatformOAuthStateRecord>();
        return result.results[0] ?? null;
    }

    async findOAuthIdentity(
        providerCode: PlatformOAuthProviderCode,
        providerSubject: string
    ): Promise<PlatformOAuthIdentity | null> {
        const row = await queryOne<PlatformOAuthIdentityRow>(
            this.database,
            `SELECT accounts.id, accounts.status, accounts.token_version,
                    accounts.created_at, accounts.updated_at, accounts.deleted_at,
                    profiles.account_id AS profile_account_id,
                    profiles.display_name AS profile_display_name,
                    profiles.avatar_object_key AS profile_avatar_object_key,
                    profiles.avatar_external_url AS profile_avatar_external_url,
                    profiles.home_city AS profile_home_city,
                    profiles.bio AS profile_bio,
                    profiles.updated_at AS profile_updated_at,
                    identities.provider_code AS oauth_provider_code,
                    identities.provider_subject AS oauth_provider_subject,
                    identities.account_id AS oauth_account_id,
                    identities.provider_display_name AS oauth_provider_display_name,
                    identities.provider_avatar_url AS oauth_provider_avatar_url,
                    identities.created_at AS oauth_created_at,
                    identities.updated_at AS oauth_updated_at
             FROM platform_oauth_identities identities
             JOIN platform_accounts accounts ON accounts.id=identities.account_id
             JOIN platform_profiles profiles ON profiles.account_id=accounts.id
             WHERE identities.provider_code=? AND identities.provider_subject=?`,
            [providerCode, providerSubject]
        );
        return row ? oauthIdentity(row) : null;
    }

    // The select list is the projection: `provider_subject` is a third-party
    // internal user id that the account-security surface has no use for, so it
    // is never read rather than read and then dropped in a view builder.
    async listOAuthIdentitiesByAccount(
        accountId: string
    ): Promise<PlatformOAuthLinkRecord[]> {
        const rows = await queryAll<PlatformOAuthLinkRow>(
            this.database,
            `SELECT identities.provider_code,
                    identities.provider_display_name,
                    identities.provider_avatar_url,
                    identities.created_at,
                    providers.display_name AS provider_label,
                    providers.enabled AS provider_enabled
             FROM platform_oauth_identities identities
             JOIN platform_oauth_providers providers
               ON providers.code=identities.provider_code
             WHERE identities.account_id=?
             ORDER BY identities.created_at, identities.provider_code
             LIMIT ${OAUTH_LINK_LIST_LIMIT}`,
            [accountId]
        );
        return rows.map((row) => ({
            provider_code: row.provider_code,
            provider_label: row.provider_label,
            provider_enabled: sqlBoolean(row.provider_enabled),
            provider_display_name: row.provider_display_name,
            provider_avatar_url: row.provider_avatar_url,
            created_at: row.created_at
        }));
    }

    async deleteOAuthIdentity(
        input: DeletePlatformOAuthIdentityInput
    ): Promise<DeletePlatformOAuthIdentityResult> {
        return this.serializeWrite(async () => {
            /**
             * "After this delete the account still has a way to sign in."
             *
             * Two clauses, matching the two things that can authenticate a
             * platform account:
             *
             * - an email password credential, or
             * - another OAuth link whose provider is still `enabled`.
             *
             * The join onto `platform_oauth_providers` is the load-bearing
             * part. A link to a disabled provider cannot complete a sign-in,
             * so counting it as a survivor would let someone drop their only
             * working link, keep a dead one, and lock themselves out.
             *
             * This is spliced into the DELETE's own WHERE clause rather than
             * evaluated in a preceding SELECT, so the row set the guard sees
             * is the row set the delete acts on.
             */
            const survivingLoginMethod = `(
                EXISTS (
                    SELECT 1 FROM platform_email_credentials credential
                    WHERE credential.account_id=?
                )
                OR EXISTS (
                    SELECT 1 FROM platform_oauth_identities survivor
                    JOIN platform_oauth_providers provider
                      ON provider.code=survivor.provider_code
                    WHERE survivor.account_id=?
                      AND survivor.provider_code<>?
                      AND provider.enabled=TRUE
                )
            )`;
            const guardValues = [
                input.accountId,
                input.accountId,
                input.providerCode
            ];
            // The event is written first, off the row that is about to go, and
            // is fenced on the same predicate as the delete: within one batch
            // nothing between them can change the answer, so the audit trail
            // records exactly the unlinks that happened.
            const results = await this.database.batch([
                sqlStatement(
                    this.database,
                    `INSERT INTO platform_security_events
                        (id, account_id, event_type, request_id, ip_address,
                         user_agent, metadata_json, created_at)
                     SELECT ?, account_id, ?, ?, ?, ?, ?, ?
                     FROM platform_oauth_identities identity
                     WHERE identity.account_id=? AND identity.provider_code=?
                       AND ${survivingLoginMethod}`,
                    [
                        ...conditionalSecurityEventValues(input.event),
                        input.accountId,
                        input.providerCode,
                        ...guardValues
                    ]
                ),
                sqlStatement(
                    this.database,
                    `DELETE FROM platform_oauth_identities
                     WHERE account_id=? AND provider_code=?
                       AND ${survivingLoginMethod}`,
                    [input.accountId, input.providerCode, ...guardValues]
                )
            ]);
            if (results[1]?.meta.changes === 1) return { status: 'deleted' };
            // Zero rows means either "no such link" or "the guard refused".
            // This read only picks the message; it can never widen what the
            // delete above was willing to do.
            const remaining = await queryOne<{ provider_code: string }>(
                this.database,
                `SELECT provider_code FROM platform_oauth_identities
                 WHERE account_id=? AND provider_code=?`,
                [input.accountId, input.providerCode]
            );
            return remaining
                ? { status: 'last-login-method' }
                : { status: 'not-found' };
        });
    }

    async createOAuthAccount(
        input: NewPlatformOAuthAccountInput
    ): Promise<CreatePlatformOAuthAccountResult> {
        try {
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
                ),
                sqlStatement(
                    this.database,
                    `INSERT INTO platform_oauth_identities
                        (provider_code, provider_subject, account_id,
                         provider_display_name, provider_avatar_url,
                         created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        input.oauth.providerCode,
                        input.oauth.providerSubject,
                        input.id,
                        input.oauth.providerDisplayName,
                        input.oauth.providerAvatarUrl,
                        input.oauth.createdAt,
                        input.oauth.updatedAt
                    ]
                )
            ]));
        } catch (error) {
            if (!isOAuthIdentityConflict(error)) throw error;
            const existing = await this.findOAuthIdentity(
                input.oauth.providerCode,
                input.oauth.providerSubject
            );
            if (!existing) throw error;
            return { status: 'identity-conflict', identity: existing };
        }
        const identity = await this.findOAuthIdentity(
            input.oauth.providerCode,
            input.oauth.providerSubject
        );
        if (!identity) throw new Error('Platform OAuth account was not created');
        return { status: 'created', identity };
    }

    async createEmailAccount(
        input: NewPlatformEmailAccountInput
    ): Promise<CreatePlatformEmailAccountResult> {
        try {
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
                ),
                sqlStatement(
                    this.database,
                    `INSERT INTO platform_email_credentials
                        (normalized_email, account_id, algorithm, parameters_json,
                         salt, password_hash, created_at, updated_at)
                     VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
                    [
                        input.credential.normalizedEmail,
                        input.id,
                        input.credential.algorithm,
                        input.credential.parametersJson,
                        input.credential.passwordHash,
                        input.credential.createdAt,
                        input.credential.updatedAt
                    ]
                )
            ]));
        } catch (error) {
            if (isEmailConflict(error)) return { status: 'email-conflict' };
            throw error;
        }
        const identity = await this.findAccountWithProfileById(input.id);
        if (!identity) throw new Error('Platform email account was not created');
        return { status: 'created', identity };
    }

    issueEmailVerification(
        input: PlatformEmailVerificationInput
    ): Promise<IssuePlatformEmailVerificationResult> {
        return this.serializeWrite(async () => {
            const [, result] = await this.database.batch<{ resend_after: number }>([
                sqlStatement(
                    this.database,
                    `DELETE FROM platform_email_verification_codes
                     WHERE expires_at<=?
                       AND (pending_token IS NULL OR pending_expires_at<=?)
                       AND normalized_email IN (
                         SELECT normalized_email
                         FROM platform_email_verification_codes
                         WHERE expires_at<=?
                           AND (
                               pending_token IS NULL OR pending_expires_at<=?
                           )
                         ORDER BY expires_at, normalized_email
                         LIMIT ${EMAIL_VERIFICATION_CLEANUP_LIMIT}
                     )`,
                    [
                        input.createdAt,
                        input.createdAt,
                        input.createdAt,
                        input.createdAt
                    ]
                ),
                sqlStatement(
                    this.database,
                    `INSERT INTO platform_email_verification_codes
                        (normalized_email, code_hash, expires_at, resend_after,
                         attempts_remaining, consumed_token, created_at, updated_at,
                         delivery_token)
                     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
                     ON CONFLICT(normalized_email) DO UPDATE SET
                        pending_token=excluded.delivery_token,
                        pending_code_hash=excluded.code_hash,
                        pending_expires_at=excluded.expires_at,
                        pending_resend_after=excluded.resend_after,
                        pending_attempts_remaining=excluded.attempts_remaining,
                        pending_created_at=excluded.created_at
                     WHERE platform_email_verification_codes.delivery_token IS NULL
                       AND platform_email_verification_codes.consumed_token IS NULL
                       AND platform_email_verification_codes.resend_after<=excluded.created_at
                       AND (
                           platform_email_verification_codes.pending_token IS NULL
                           OR platform_email_verification_codes.pending_expires_at<=
                                excluded.created_at
                       )
                     RETURNING resend_after`,
                    [
                        input.normalizedEmail,
                        input.codeHash,
                        input.expiresAt,
                        input.resendAfter,
                        input.attemptsRemaining,
                        input.createdAt,
                        input.createdAt,
                        input.deliveryToken
                    ]
                )
            ]);
            if (result?.results.length === 1) return { status: 'issued' };
            const current = await queryOne<{
                retry_after: number;
            }>(
                this.database,
                `SELECT CASE
                            WHEN delivery_token IS NOT NULL THEN expires_at
                            WHEN pending_token IS NOT NULL AND pending_expires_at>?
                                THEN pending_expires_at
                            ELSE resend_after
                        END AS retry_after
                 FROM platform_email_verification_codes
                 WHERE normalized_email=?`,
                [input.createdAt, input.normalizedEmail]
            );
            return {
                status: 'cooldown',
                retryAfterMs: Math.max(
                    1,
                    Number(current?.retry_after ?? input.resendAfter) - input.createdAt
                )
            };
        });
    }

    async completeEmailVerificationDelivery(
        normalizedEmail: string,
        deliveryToken: string
    ): Promise<boolean> {
        return this.serializeWrite(async () => {
            const result = await executeSql(
                this.database,
                `UPDATE platform_email_verification_codes
                 SET code_hash=CASE
                         WHEN pending_token=? THEN pending_code_hash
                         ELSE code_hash
                     END,
                     expires_at=CASE
                         WHEN pending_token=? THEN pending_expires_at
                         ELSE expires_at
                     END,
                     resend_after=CASE
                         WHEN pending_token=? THEN pending_resend_after
                         ELSE resend_after
                     END,
                     attempts_remaining=CASE
                         WHEN pending_token=? THEN pending_attempts_remaining
                         ELSE attempts_remaining
                     END,
                     consumed_token=NULL,
                     created_at=CASE
                         WHEN pending_token=? THEN pending_created_at
                         ELSE created_at
                     END,
                     updated_at=CASE
                         WHEN pending_token=? THEN pending_created_at
                         ELSE updated_at
                     END,
                     delivery_token=NULL,
                     pending_token=NULL,
                     pending_code_hash=NULL,
                     pending_expires_at=NULL,
                     pending_resend_after=NULL,
                     pending_attempts_remaining=NULL,
                     pending_created_at=NULL
                 WHERE normalized_email=? AND consumed_token IS NULL
                   AND (delivery_token=? OR pending_token=?)`,
                [
                    deliveryToken,
                    deliveryToken,
                    deliveryToken,
                    deliveryToken,
                    deliveryToken,
                    deliveryToken,
                    normalizedEmail,
                    deliveryToken,
                    deliveryToken
                ]
            );
            return result.meta.changes === 1;
        });
    }

    async revokeEmailVerification(
        normalizedEmail: string,
        deliveryToken: string
    ): Promise<void> {
        await this.serializeWrite(async () => {
            await this.database.batch([
                sqlStatement(
                    this.database,
                    `UPDATE platform_email_verification_codes
                     SET pending_token=NULL,
                         pending_code_hash=NULL,
                         pending_expires_at=NULL,
                         pending_resend_after=NULL,
                         pending_attempts_remaining=NULL,
                         pending_created_at=NULL
                     WHERE normalized_email=? AND pending_token=?`,
                    [normalizedEmail, deliveryToken]
                ),
                sqlStatement(
                    this.database,
                    `DELETE FROM platform_email_verification_codes
                     WHERE normalized_email=? AND delivery_token=?
                       AND pending_token IS NULL AND consumed_token IS NULL`,
                    [normalizedEmail, deliveryToken]
                )
            ]);
        });
    }

    createVerifiedEmailAccount(
        input: NewVerifiedPlatformEmailAccountInput
    ): Promise<CreateVerifiedPlatformEmailAccountResult> {
        return this.serializeWrite(async () => {
            let results;
            try {
                results = await this.database.batch([
                    sqlStatement(
                        this.database,
                        `UPDATE platform_email_verification_codes
                         SET attempts_remaining=attempts_remaining-
                                CASE WHEN code_hash=? THEN 0 ELSE 1 END,
                             consumed_token=CASE WHEN code_hash=? THEN ? ELSE NULL END,
                             updated_at=?
                         WHERE normalized_email=? AND consumed_token IS NULL
                           AND delivery_token IS NULL
                           AND expires_at>? AND attempts_remaining>0
                         RETURNING consumed_token`,
                        [
                            input.verification.codeHash,
                            input.verification.codeHash,
                            input.verification.consumedToken,
                            input.verification.verifiedAt,
                            input.credential.normalizedEmail,
                            input.verification.verifiedAt
                        ]
                    ),
                    sqlStatement(
                        this.database,
                        `INSERT INTO platform_accounts
                            (id, status, token_version, created_at, updated_at, deleted_at)
                         SELECT ?, ?, ?, ?, ?, ?
                         WHERE EXISTS (
                             SELECT 1 FROM platform_email_verification_codes
                             WHERE normalized_email=? AND code_hash=?
                               AND consumed_token=? AND expires_at>?
                         )`,
                        [
                            input.id,
                            input.status,
                            input.tokenVersion,
                            input.createdAt,
                            input.updatedAt,
                            input.deletedAt,
                            input.credential.normalizedEmail,
                            input.verification.codeHash,
                            input.verification.consumedToken,
                            input.verification.verifiedAt
                        ]
                    ),
                    sqlStatement(
                        this.database,
                        `INSERT INTO platform_profiles
                            (account_id, display_name, avatar_object_key,
                             avatar_external_url, home_city, bio, updated_at)
                         SELECT ?, ?, ?, ?, ?, ?, ?
                         WHERE EXISTS (
                             SELECT 1 FROM platform_accounts account
                             JOIN platform_email_verification_codes verification
                               ON verification.normalized_email=?
                             WHERE account.id=? AND verification.code_hash=?
                               AND verification.consumed_token=?
                               AND verification.expires_at>?
                         )`,
                        [
                            input.id,
                            input.profile.displayName,
                            input.profile.avatarObjectKey,
                            input.profile.avatarExternalUrl,
                            input.profile.homeCity,
                            input.profile.bio,
                            input.profile.updatedAt,
                            input.credential.normalizedEmail,
                            input.id,
                            input.verification.codeHash,
                            input.verification.consumedToken,
                            input.verification.verifiedAt
                        ]
                    ),
                    sqlStatement(
                        this.database,
                        `INSERT INTO platform_email_credentials
                            (normalized_email, account_id, algorithm, parameters_json,
                             salt, password_hash, created_at, updated_at)
                         SELECT ?, ?, ?, ?, NULL, ?, ?, ?
                         WHERE EXISTS (
                             SELECT 1 FROM platform_accounts account
                             JOIN platform_profiles profile ON profile.account_id=account.id
                             JOIN platform_email_verification_codes verification
                               ON verification.normalized_email=?
                             WHERE account.id=? AND verification.code_hash=?
                               AND verification.consumed_token=?
                               AND verification.expires_at>?
                         )`,
                        [
                            input.credential.normalizedEmail,
                            input.id,
                            input.credential.algorithm,
                            input.credential.parametersJson,
                            input.credential.passwordHash,
                            input.credential.createdAt,
                            input.credential.updatedAt,
                            input.credential.normalizedEmail,
                            input.id,
                            input.verification.codeHash,
                            input.verification.consumedToken,
                            input.verification.verifiedAt
                        ]
                    ),
                    sqlStatement(
                        this.database,
                        `DELETE FROM platform_email_verification_codes
                         WHERE normalized_email=? AND code_hash=? AND consumed_token=?
                           AND EXISTS (
                               SELECT 1 FROM platform_email_credentials credential
                               WHERE credential.normalized_email=? AND credential.account_id=?
                           )`,
                        [
                            input.credential.normalizedEmail,
                            input.verification.codeHash,
                            input.verification.consumedToken,
                            input.credential.normalizedEmail,
                            input.id
                        ]
                    )
                ]);
            } catch (error) {
                if (isEmailConflict(error)) return { status: 'email-conflict' };
                throw error;
            }
            if (results[3]?.meta.changes !== 1 || results[4]?.meta.changes !== 1) {
                return { status: 'verification-invalid' };
            }
            const identity = await this.findAccountWithProfileById(input.id);
            if (!identity) throw new Error('Verified Platform email account was not created');
            return { status: 'created', identity };
        });
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

    issuePasswordReset(
        input: PlatformPasswordResetInput
    ): Promise<IssuePlatformPasswordResetResult> {
        return this.serializeWrite(async () => {
            const account = await queryOne<{ account_id: string }>(
                this.database,
                `SELECT account_id FROM platform_email_credentials
                 WHERE normalized_email=?`,
                [input.normalizedEmail]
            );
            if (!account) return { status: 'email-not-found' };
            const [, result] = await this.database.batch<{ resend_after: number }>([
                sqlStatement(
                    this.database,
                    `DELETE FROM platform_password_reset_codes
                     WHERE expires_at<=?
                       AND (pending_token IS NULL OR pending_expires_at<=?)
                       AND normalized_email IN (
                         SELECT normalized_email
                         FROM platform_password_reset_codes
                         WHERE expires_at<=?
                           AND (pending_token IS NULL OR pending_expires_at<=?)
                         ORDER BY expires_at, normalized_email
                         LIMIT ${EMAIL_VERIFICATION_CLEANUP_LIMIT}
                     )`,
                    [
                        input.createdAt,
                        input.createdAt,
                        input.createdAt,
                        input.createdAt
                    ]
                ),
                sqlStatement(
                    this.database,
                    `INSERT INTO platform_password_reset_codes
                        (normalized_email, code_hash, expires_at, resend_after,
                         attempts_remaining, consumed_at, created_at, updated_at,
                         delivery_token)
                     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
                     ON CONFLICT(normalized_email) DO UPDATE SET
                        pending_token=excluded.delivery_token,
                        pending_code_hash=excluded.code_hash,
                        pending_expires_at=excluded.expires_at,
                        pending_resend_after=excluded.resend_after,
                        pending_attempts_remaining=excluded.attempts_remaining,
                        pending_created_at=excluded.created_at,
                        consumed_at=NULL
                     WHERE platform_password_reset_codes.delivery_token IS NULL
                       AND platform_password_reset_codes.resend_after<=excluded.created_at
                       AND (
                           platform_password_reset_codes.pending_token IS NULL
                           OR platform_password_reset_codes.pending_expires_at<=
                                excluded.created_at
                       )
                     RETURNING resend_after`,
                    [
                        input.normalizedEmail,
                        input.codeHash,
                        input.expiresAt,
                        input.resendAfter,
                        input.attemptsRemaining,
                        input.createdAt,
                        input.createdAt,
                        input.deliveryToken
                    ]
                )
            ]);
            if (result?.results.length === 1) return { status: 'issued' };
            const current = await queryOne<{ retry_after: number }>(
                this.database,
                `SELECT CASE
                            WHEN delivery_token IS NOT NULL THEN expires_at
                            WHEN pending_token IS NOT NULL AND pending_expires_at>?
                                THEN pending_expires_at
                            ELSE resend_after
                        END AS retry_after
                 FROM platform_password_reset_codes
                 WHERE normalized_email=?`,
                [input.createdAt, input.normalizedEmail]
            );
            return {
                status: 'cooldown',
                retryAfterMs: Math.max(
                    1,
                    Number(current?.retry_after ?? input.resendAfter) - input.createdAt
                )
            };
        });
    }

    async completePasswordResetDelivery(
        normalizedEmail: string,
        deliveryToken: string
    ): Promise<boolean> {
        const result = await sqlStatement(
            this.database,
            `UPDATE platform_password_reset_codes
             SET code_hash=pending_code_hash,
                 expires_at=pending_expires_at,
                 resend_after=pending_resend_after,
                 attempts_remaining=pending_attempts_remaining,
                 created_at=pending_created_at,
                 updated_at=pending_created_at,
                 delivery_token=?,
                 pending_token=NULL,
                 pending_code_hash=NULL,
                 pending_expires_at=NULL,
                 pending_resend_after=NULL,
                 pending_attempts_remaining=NULL,
                 pending_created_at=NULL
             WHERE normalized_email=? AND pending_token=?
             RETURNING normalized_email`,
            [deliveryToken, normalizedEmail, deliveryToken]
        ).all();
        return result.results.length === 1;
    }

    async revokePasswordReset(
        normalizedEmail: string,
        deliveryToken: string
    ): Promise<void> {
        await this.serializeWrite(() => this.database.batch([
            sqlStatement(
                this.database,
                `DELETE FROM platform_password_reset_codes
                 WHERE normalized_email=? AND delivery_token=?`,
                [normalizedEmail, deliveryToken]
            ),
            sqlStatement(
                this.database,
                `UPDATE platform_password_reset_codes
                 SET pending_token=NULL, pending_code_hash=NULL,
                     pending_expires_at=NULL, pending_resend_after=NULL,
                     pending_attempts_remaining=NULL, pending_created_at=NULL,
                     updated_at=?
                 WHERE normalized_email=? AND pending_token=?`,
                [Date.now(), normalizedEmail, deliveryToken]
            )
        ]));
    }

    async completePasswordReset(
        input: CompletePlatformPasswordResetInput
    ): Promise<CompletePlatformPasswordResetResult> {
        return this.serializeWrite(async () => {
            const identity = await queryOne<{ account_id: string }>(
                this.database,
                `SELECT credentials.account_id
                 FROM platform_email_credentials credentials
                 JOIN platform_accounts accounts ON accounts.id=credentials.account_id
                 WHERE credentials.normalized_email=?
                   AND accounts.status IN ('active', 'restricted')`,
                [input.normalizedEmail]
            );
            if (!identity) return { status: 'invalid' };
            const results = await this.database.batch<{ consumed_at: number }>([
                sqlStatement(
                    this.database,
                    `UPDATE platform_password_reset_codes
                     SET attempts_remaining=attempts_remaining-
                            CASE WHEN code_hash=? THEN 0 ELSE 1 END,
                         consumed_at=CASE WHEN code_hash=? THEN ? ELSE NULL END,
                         updated_at=?
                     WHERE normalized_email=? AND delivery_token IS NULL
                       AND expires_at>? AND attempts_remaining>0
                       AND EXISTS (
                           SELECT 1 FROM platform_email_credentials credentials
                           JOIN platform_accounts accounts
                             ON accounts.id=credentials.account_id
                           WHERE credentials.normalized_email=?
                             AND accounts.status IN ('active', 'restricted')
                       )
                     RETURNING consumed_at`,
                    [
                        input.codeHash,
                        input.codeHash,
                        input.updatedAt,
                        input.updatedAt,
                        input.normalizedEmail,
                        input.updatedAt,
                        input.normalizedEmail
                    ]
                ),
                sqlStatement(
                    this.database,
                    `UPDATE platform_email_credentials
                     SET algorithm='bcrypt', parameters_json=?, salt=NULL,
                         password_hash=?, updated_at=?
                     WHERE normalized_email=? AND account_id=?
                       AND EXISTS (
                           SELECT 1 FROM platform_password_reset_codes
                           WHERE normalized_email=? AND code_hash=?
                             AND consumed_at=?
                       )`,
                    [
                        input.parametersJson,
                        input.passwordHash,
                        input.updatedAt,
                        input.normalizedEmail,
                        identity.account_id,
                        input.normalizedEmail,
                        input.codeHash,
                        input.updatedAt
                    ]
                ),
                sqlStatement(
                    this.database,
                    `UPDATE platform_accounts
                     SET token_version=token_version+1, updated_at=?
                     WHERE id=? AND EXISTS (
                         SELECT 1 FROM platform_password_reset_codes
                         WHERE normalized_email=? AND code_hash=? AND consumed_at=?
                     )`,
                    [
                        input.updatedAt,
                        identity.account_id,
                        input.normalizedEmail,
                        input.codeHash,
                        input.updatedAt
                    ]
                ),
                sqlStatement(
                    this.database,
                    `UPDATE platform_refresh_sessions
                     SET revoked_at=?, updated_at=?
                     WHERE account_id=? AND revoked_at IS NULL
                       AND EXISTS (
                           SELECT 1 FROM platform_password_reset_codes
                           WHERE normalized_email=? AND code_hash=? AND consumed_at=?
                       )`,
                    [
                        input.updatedAt,
                        input.updatedAt,
                        identity.account_id,
                        input.normalizedEmail,
                        input.codeHash,
                        input.updatedAt
                    ]
                ),
                sqlStatement(
                    this.database,
                    `INSERT INTO platform_security_events
                        (id, account_id, event_type, request_id, ip_address,
                         user_agent, metadata_json, created_at)
                     SELECT ?, ?, ?, ?, ?, ?, ?, ?
                     WHERE EXISTS (
                         SELECT 1 FROM platform_password_reset_codes
                         WHERE normalized_email=? AND code_hash=? AND consumed_at=?
                     )`,
                    [
                        input.event.id,
                        identity.account_id,
                        input.event.eventType,
                        input.event.requestId,
                        input.event.ipAddress,
                        input.event.userAgent,
                        input.event.metadataJson,
                        input.event.createdAt,
                        input.normalizedEmail,
                        input.codeHash,
                        input.updatedAt
                    ]
                ),
                sqlStatement(
                    this.database,
                    `DELETE FROM platform_password_reset_codes
                     WHERE normalized_email=? AND code_hash=? AND consumed_at=?`,
                    [input.normalizedEmail, input.codeHash, input.updatedAt]
                )
            ]);
            const consumed = results[0]?.results[0]?.consumed_at;
            if (Number(consumed) !== input.updatedAt || results[1]?.meta.changes !== 1) {
                return { status: 'invalid' };
            }
            const account = await this.findAccountWithProfileById(identity.account_id);
            if (!account) return { status: 'invalid' };
            return { status: 'completed', account };
        });
    }

    async findEmailIdentity(normalizedEmail: string): Promise<PlatformEmailIdentity | null> {
        const row = await queryOne<PlatformEmailIdentityRow>(
            this.database,
            `SELECT accounts.id, accounts.status, accounts.token_version,
                    accounts.created_at, accounts.updated_at, accounts.deleted_at,
                    profiles.account_id AS profile_account_id,
                    profiles.display_name AS profile_display_name,
                    profiles.avatar_object_key AS profile_avatar_object_key,
                    profiles.avatar_external_url AS profile_avatar_external_url,
                    profiles.home_city AS profile_home_city,
                    profiles.bio AS profile_bio,
                    profiles.updated_at AS profile_updated_at,
                    credentials.normalized_email AS credential_normalized_email,
                    credentials.account_id AS credential_account_id,
                    credentials.algorithm AS credential_algorithm,
                    credentials.parameters_json AS credential_parameters_json,
                    credentials.salt AS credential_salt,
                    credentials.password_hash AS credential_password_hash,
                    credentials.created_at AS credential_created_at,
                    credentials.updated_at AS credential_updated_at
             FROM platform_email_credentials credentials
             JOIN platform_accounts accounts ON accounts.id=credentials.account_id
             JOIN platform_profiles profiles ON profiles.account_id=accounts.id
             WHERE credentials.normalized_email=?`,
            [normalizedEmail]
        );
        return row ? emailIdentity(row) : null;
    }

    findEmailCredentialByAccountId(
        accountId: string
    ): Promise<PlatformEmailCredentialRecord | null> {
        return queryOne<PlatformEmailCredentialRecord>(
            this.database,
            `SELECT ${EMAIL_CREDENTIAL_COLUMNS}
             FROM platform_email_credentials
             WHERE account_id=?`,
            [accountId]
        );
    }

    // Every statement after the credential rewrite is fenced on the credential
    // already carrying the new hash and timestamp, so the batch either applies
    // as one unit or leaves the account exactly as it was.
    async updatePasswordForAccount(
        input: UpdatePlatformPasswordInput
    ): Promise<UpdatePlatformPasswordResult> {
        return this.serializeWrite(async () => {
            const current = await queryOne<{
                password_hash: string;
                updated_at: number;
                token_version: number;
            }>(
                this.database,
                `SELECT credentials.password_hash, credentials.updated_at,
                        accounts.token_version
                 FROM platform_email_credentials credentials
                 JOIN platform_accounts accounts
                   ON accounts.id=credentials.account_id
                 WHERE credentials.account_id=? AND accounts.status='active'
                   AND accounts.deleted_at IS NULL`,
                [input.accountId]
            );
            if (!current) return { status: 'unavailable' };
            if (
                current.password_hash !== input.expectedPasswordHash ||
                current.updated_at !== input.expectedUpdatedAt
            ) {
                return { status: 'conflict' };
            }
            const applied: [string, unknown[]] = [
                `EXISTS (
                     SELECT 1 FROM platform_email_credentials
                     WHERE account_id=? AND password_hash=? AND updated_at=?
                 )`,
                [input.accountId, input.passwordHash, input.updatedAt]
            ];
            const results = await this.database.batch([
                sqlStatement(
                    this.database,
                    `UPDATE platform_email_credentials
                     SET algorithm='bcrypt', parameters_json=?, salt=NULL,
                         password_hash=?, updated_at=?
                     WHERE account_id=? AND password_hash=? AND updated_at=?`,
                    [
                        input.parametersJson,
                        input.passwordHash,
                        input.updatedAt,
                        input.accountId,
                        input.expectedPasswordHash,
                        input.expectedUpdatedAt
                    ]
                ),
                sqlStatement(
                    this.database,
                    `UPDATE platform_accounts
                     SET token_version=token_version+1, updated_at=?
                     WHERE id=? AND status='active' AND deleted_at IS NULL
                       AND ${applied[0]}`,
                    [input.updatedAt, input.accountId, ...applied[1]]
                ),
                sqlStatement(
                    this.database,
                    // Bounded by expiry so the returned count matches what the
                    // device list showed: that list hides expired sessions, and
                    // an expired refresh token cannot be redeemed anyway, so
                    // sweeping it in would only inflate the number we report.
                    `UPDATE platform_refresh_sessions
                     SET revoked_at=?, updated_at=?
                     WHERE account_id=? AND id<>? AND revoked_at IS NULL
                       AND expires_at>? AND ${applied[0]}`,
                    [
                        input.updatedAt,
                        input.updatedAt,
                        input.accountId,
                        input.keepSessionId,
                        input.updatedAt,
                        ...applied[1]
                    ]
                ),
                sqlStatement(
                    this.database,
                    `UPDATE platform_refresh_sessions
                     SET token_hash=?, previous_token_hash=NULL, expires_at=?,
                         updated_at=?, last_seen_at=?
                     WHERE id=? AND account_id=? AND revoked_at IS NULL
                       AND ${applied[0]}`,
                    [
                        input.keepSessionTokenHash,
                        input.keepSessionExpiresAt,
                        input.updatedAt,
                        input.updatedAt,
                        input.keepSessionId,
                        input.accountId,
                        ...applied[1]
                    ]
                ),
                sqlStatement(
                    this.database,
                    `INSERT INTO platform_security_events
                        (id, account_id, event_type, request_id, ip_address,
                         user_agent, metadata_json, created_at)
                     SELECT ?, ?, ?, ?, ?, ?, ?, ?
                     WHERE ${applied[0]}`,
                    [
                        ...securityEventValues(input.event, input.accountId),
                        ...applied[1]
                    ]
                )
            ]);
            if (results[0]?.meta.changes !== 1) return { status: 'conflict' };
            return {
                status: 'saved',
                tokenVersion: current.token_version + 1,
                revokedSessionCount: results[2]?.meta.changes ?? 0
            };
        });
    }

    async upgradeEmailCredentialToBcrypt(input: {
        normalizedEmail: string;
        expectedAlgorithm: 'pbkdf2-sha256';
        expectedPasswordHash: string;
        expectedUpdatedAt: number;
        passwordHash: string;
        parametersJson: string;
        updatedAt: number;
    }): Promise<boolean> {
        return this.serializeWrite(async () => {
            const result = await executeSql(
                this.database,
                `UPDATE platform_email_credentials
                 SET algorithm='bcrypt', parameters_json=?, salt=NULL,
                     password_hash=?, updated_at=?
                 WHERE normalized_email=? AND algorithm=? AND password_hash=?
                   AND updated_at=?`,
                [
                    input.parametersJson,
                    input.passwordHash,
                    input.updatedAt,
                    input.normalizedEmail,
                    input.expectedAlgorithm,
                    input.expectedPasswordHash,
                    input.expectedUpdatedAt
                ]
            );
            return result.meta.changes === 1;
        });
    }

    private findActiveProfileById(
        accountId: string
    ): Promise<PlatformProfileRecord | null> {
        return queryOne<PlatformProfileRecord>(
            this.database,
            `SELECT ${PROFILE_COLUMNS}
             FROM platform_profiles
             WHERE account_id=? AND EXISTS (
                 SELECT 1 FROM platform_accounts account
                 WHERE account.id=platform_profiles.account_id
                   AND account.status='active' AND account.deleted_at IS NULL
             )`,
            [accountId]
        );
    }

    private profileWriteFailure(
        current: PlatformProfileRecord | null,
        expectedUpdatedAt: number
    ): PlatformProfileSaveResult {
        if (!current) return { status: 'unavailable' };
        if (current.updated_at !== expectedUpdatedAt) {
            return { status: 'conflict', updatedAt: current.updated_at };
        }
        return { status: 'unavailable' };
    }

    updateProfileTextForOwner(
        input: UpdatePlatformProfileTextInput
    ): Promise<PlatformProfileSaveResult> {
        return this.serializeWrite(async () => {
            const current = await this.findActiveProfileById(input.accountId);
            if (!current || current.updated_at !== input.expectedUpdatedAt) {
                return this.profileWriteFailure(current, input.expectedUpdatedAt);
            }
            const result = await this.database.prepare(
                `UPDATE platform_profiles
                 SET display_name=?, home_city=?, bio=?, updated_at=?
                 WHERE account_id=? AND updated_at=? AND EXISTS (
                     SELECT 1 FROM platform_accounts account
                     WHERE account.id=platform_profiles.account_id
                       AND account.status='active' AND account.deleted_at IS NULL
                 )
                 RETURNING ${PROFILE_COLUMNS}`
            ).bind(
                input.displayName,
                input.homeCity,
                input.bio,
                input.updatedAt,
                input.accountId,
                input.expectedUpdatedAt
            ).run<PlatformProfileRecord>();
            const saved = result.results[0];
            if (saved) {
                return {
                    status: 'saved',
                    profile: saved,
                    previousAvatarObjectKey: current.avatar_object_key
                };
            }
            return this.profileWriteFailure(
                await this.findActiveProfileById(input.accountId),
                input.expectedUpdatedAt
            );
        });
    }

    updateProfileAvatarForOwner(
        input: UpdatePlatformProfileAvatarInput
    ): Promise<PlatformProfileSaveResult> {
        return this.serializeWrite(async () => {
            const current = await this.findActiveProfileById(input.accountId);
            if (!current || current.updated_at !== input.expectedUpdatedAt) {
                return this.profileWriteFailure(current, input.expectedUpdatedAt);
            }
            const result = await this.database.prepare(
                `UPDATE platform_profiles
                 SET avatar_object_key=?, avatar_external_url=NULL, updated_at=?
                 WHERE account_id=? AND updated_at=? AND EXISTS (
                     SELECT 1 FROM platform_accounts account
                     WHERE account.id=platform_profiles.account_id
                       AND account.status='active' AND account.deleted_at IS NULL
                 )
                 RETURNING ${PROFILE_COLUMNS}`
            ).bind(
                input.avatarObjectKey,
                input.updatedAt,
                input.accountId,
                input.expectedUpdatedAt
            ).run<PlatformProfileRecord>();
            const saved = result.results[0];
            if (saved) {
                return {
                    status: 'saved',
                    profile: saved,
                    previousAvatarObjectKey: current.avatar_object_key
                };
            }
            return this.profileWriteFailure(
                await this.findActiveProfileById(input.accountId),
                input.expectedUpdatedAt
            );
        });
    }

    async createRefreshSession(input: NewPlatformRefreshSessionInput): Promise<boolean> {
        const results = await this.serializeWrite(() => this.database.batch([
            sqlStatement(
                this.database,
                `INSERT INTO platform_refresh_sessions
                    (id, account_id, token_hash, previous_token_hash, csrf_hash,
                     expires_at, created_at, updated_at, revoked_at, user_agent,
                     ip_address, last_seen_at)
                 SELECT ?, account.id, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?
                 FROM platform_accounts account
                 WHERE account.id=? AND account.token_version=?
                   AND account.status IN ('active', 'restricted')
                   AND account.deleted_at IS NULL`,
                [
                    input.id,
                    input.tokenHash,
                    input.csrfHash,
                    input.expiresAt,
                    input.createdAt,
                    input.createdAt,
                    input.userAgent ?? null,
                    input.ipAddress ?? null,
                    input.createdAt,
                    input.accountId,
                    input.accountTokenVersion
                ]
            ),
            sqlStatement(
                this.database,
                `INSERT INTO platform_security_events
                    (id, account_id, event_type, request_id, ip_address, user_agent,
                     metadata_json, created_at)
                 SELECT ?, account_id, ?, ?, ?, ?, ?, ?
                 FROM platform_refresh_sessions
                 WHERE id=? AND account_id=? AND token_hash=?`,
                [
                    ...conditionalSecurityEventValues(input.event),
                    input.id,
                    input.accountId,
                    input.tokenHash
                ]
            )
        ]));
        return results[0]?.meta.changes === 1;
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

    // Only live sessions are listable: a revoked or expired row is not a device
    // the owner can still act on.
    listRefreshSessionsByAccount(
        accountId: string,
        activeAt: number
    ): Promise<PlatformRefreshSessionRecord[]> {
        return queryAll<PlatformRefreshSessionRecord>(
            this.database,
            `SELECT ${REFRESH_SESSION_COLUMNS}
             FROM platform_refresh_sessions
             WHERE account_id=? AND revoked_at IS NULL AND expires_at>?
             ORDER BY COALESCE(last_seen_at, created_at) DESC, id
             LIMIT ${REFRESH_SESSION_LIST_LIMIT}`,
            [accountId, activeAt]
        );
    }

    async rotateRefreshSession(input: {
        id: string;
        accountTokenVersion: number;
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
                     expires_at=?, updated_at=?, last_seen_at=?
                 WHERE id=? AND token_hash=? AND revoked_at IS NULL AND expires_at>?
                   AND EXISTS (
                       SELECT 1 FROM platform_accounts account
                       WHERE account.id=platform_refresh_sessions.account_id
                         AND account.token_version=?
                         AND account.status IN ('active', 'restricted')
                         AND account.deleted_at IS NULL
                   )`,
                [
                    input.nextTokenHash,
                    input.nextCsrfHash,
                    input.nextExpiresAt,
                    input.updatedAt,
                    input.updatedAt,
                    input.id,
                    input.currentTokenHash,
                    input.updatedAt,
                    input.accountTokenVersion
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

    async revokeAllRefreshSessionsExcept(
        input: RevokePlatformRefreshSessionsInput
    ): Promise<number> {
        const results = await this.serializeWrite(() => this.database.batch([
            sqlStatement(
                this.database,
                `INSERT INTO platform_security_events
                    (id, account_id, event_type, request_id, ip_address,
                     user_agent, metadata_json, created_at)
                 SELECT ?, ?, ?, ?, ?, ?, ?, ?
                 WHERE EXISTS (
                     SELECT 1 FROM platform_refresh_sessions
                     WHERE account_id=? AND id<>? AND revoked_at IS NULL
                       AND expires_at>?
                 )`,
                [
                    ...securityEventValues(input.event, input.accountId),
                    input.accountId,
                    input.keepSessionId,
                    input.revokedAt
                ]
            ),
            sqlStatement(
                this.database,
                // Same expiry bound as the device list, so "logged out N
                // devices" never exceeds the N the user was just looking at.
                `UPDATE platform_refresh_sessions
                 SET revoked_at=?, updated_at=?
                 WHERE account_id=? AND id<>? AND revoked_at IS NULL
                   AND expires_at>?`,
                [
                    input.revokedAt,
                    input.revokedAt,
                    input.accountId,
                    input.keepSessionId,
                    input.revokedAt
                ]
            )
        ]));
        return results[1]?.meta.changes ?? 0;
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
