export type AdminRole = "admin" | "super_admin";

export interface BackofficeAccountRecord {
    id: number;
    username: string;
    password: string;
    dept: string;
    producername: string | null;
    admin_role: AdminRole | null;
}

export interface AdminAccountRecord {
    id: number;
    username: string;
    producername: string | null;
    admin_role: AdminRole;
}

export interface NewAdminAccountInput {
    username: string;
    passwordHash: string;
    producername: string;
}

export interface BackofficeRefreshSessionRecord {
    id: string;
    account_id: number;
    token_hash: string;
    previous_token_hash: string | null;
    csrf_hash: string;
    expires_at: number;
    created_at: number;
    updated_at: number;
    revoked_at: number | null;
}

export interface NewBackofficeRefreshSessionInput {
    id: string;
    accountId: number;
    tokenHash: string;
    csrfHash: string;
    expiresAt: number;
    createdAt: number;
}

export interface BackofficeAuthRepository {
    findUserByUsername(
        username: string,
    ): Promise<BackofficeAccountRecord | null>;
    findUserById(id: number): Promise<BackofficeAccountRecord | null>;
    createRefreshSession(
        input: NewBackofficeRefreshSessionInput,
    ): Promise<void>;
    findRefreshSessionByTokenHash(
        tokenHash: string,
    ): Promise<BackofficeRefreshSessionRecord | null>;
    rotateRefreshSession(input: {
        id: string;
        currentTokenHash: string;
        nextTokenHash: string;
        nextExpiresAt: number;
        updatedAt: number;
    }): Promise<boolean>;
    revokeRefreshSession(id: string, revokedAt: number): Promise<void>;
    deleteExpiredRefreshSessions(now: number): Promise<void>;
}

export interface AdminAccountRepository {
    ensureSuperAdmin(username?: string): Promise<void>;
    listAdminAccounts(): Promise<AdminAccountRecord[]>;
    createAdminAccount(
        input: NewAdminAccountInput,
    ): Promise<AdminAccountRecord>;
    deleteAdminAccount(id: number): Promise<DeleteAdminAccountResult>;
}

export type DeleteAdminAccountResult =
    | "deleted"
    | "moderation-history"
    | "not-deletable";

export interface AuditLogInput {
    username: string;
    producername: string;
    action: string;
    target: string;
    ip: string;
    time: string;
}

export interface AuditRepository {
    insertAuditLog(input: AuditLogInput): Promise<void>;
    listRecentAuditLogs(limit: number): Promise<Record<string, unknown>[]>;
}
