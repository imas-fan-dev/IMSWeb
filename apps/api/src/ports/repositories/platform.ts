import type {
    PlatformOAuthProviderCode,
    PlatformOAuthProviderStore
} from "@/ports/oauth";
import type {
    WikiStoryCatalogOptionInput
} from '@/ports/repositories/wiki';

export type PlatformAccountStatus =
    | "active"
    | "restricted"
    | "suspended"
    | "deleted";

export interface PlatformAccountRecord {
    id: string;
    status: PlatformAccountStatus;
    token_version: number;
    created_at: number;
    updated_at: number;
    deleted_at: number | null;
}

export interface PlatformProfileRecord {
    account_id: string;
    display_name: string;
    avatar_object_key: string | null;
    avatar_external_url: string | null;
    home_city: string | null;
    bio: string;
    updated_at: number;
}

export interface PlatformAccountWithProfile {
    account: PlatformAccountRecord;
    profile: PlatformProfileRecord;
}

export type PlatformEmailCredentialAlgorithm = "pbkdf2-sha256" | "bcrypt";

export interface PlatformEmailCredentialRecord {
    normalized_email: string;
    account_id: string;
    algorithm: PlatformEmailCredentialAlgorithm;
    parameters_json: string;
    salt: string | null;
    password_hash: string;
    created_at: number;
    updated_at: number;
}

export interface PlatformEmailIdentity extends PlatformAccountWithProfile {
    credential: PlatformEmailCredentialRecord;
}

export interface NewPlatformAccountInput {
    id: string;
    status: PlatformAccountStatus;
    tokenVersion: number;
    createdAt: number;
    updatedAt: number;
    deletedAt: number | null;
    profile: {
        displayName: string;
        avatarObjectKey: string | null;
        avatarExternalUrl: string | null;
        homeCity: string | null;
        bio: string;
        updatedAt: number;
    };
}

export interface NewPlatformEmailAccountInput extends NewPlatformAccountInput {
    credential: {
        normalizedEmail: string;
        algorithm: "bcrypt";
        parametersJson: string;
        passwordHash: string;
        createdAt: number;
        updatedAt: number;
    };
}

export interface PlatformOAuthIdentity extends PlatformAccountWithProfile {
    oauth: {
        provider_code: PlatformOAuthProviderCode;
        provider_subject: string;
        account_id: string;
        provider_display_name: string;
        provider_avatar_url: string;
        created_at: number;
        updated_at: number;
    };
}

/**
 * One row of "which third-party logins does this account have", joined to its
 * provider so the caller can tell a usable link from a disabled one.
 *
 * Deliberately not `PlatformOAuthIdentity`: that type is the sign-in path's
 * record and drags a whole account and profile along with it. This one is the
 * account-security projection, and it omits `provider_subject` by
 * construction — the third-party's internal user id is not something the
 * listing needs, so it never leaves the database.
 */
export interface PlatformOAuthLinkRecord {
    provider_code: PlatformOAuthProviderCode;
    /** `platform_oauth_providers.display_name`: the provider's own name. */
    provider_label: string;
    provider_enabled: boolean;
    /** The user's display name at the provider; empty string when unknown. */
    provider_display_name: string;
    provider_avatar_url: string;
    created_at: number;
}

export interface DeletePlatformOAuthIdentityInput {
    accountId: string;
    providerCode: PlatformOAuthProviderCode;
    event: PlatformSecurityEventInput;
}

/**
 * `last-login-method` means the row is there but removing it would leave the
 * account with no way back in. It is reported separately from `not-found` on
 * purpose: the caller already owns the link, so telling them why the refusal
 * happened leaks nothing they did not already know.
 */
export type DeletePlatformOAuthIdentityResult =
    | { status: "deleted" }
    | { status: "not-found" }
    | { status: "last-login-method" };

export interface NewPlatformOAuthAccountInput extends NewPlatformAccountInput {
    oauth: {
        providerCode: PlatformOAuthProviderCode;
        providerSubject: string;
        providerDisplayName: string;
        providerAvatarUrl: string;
        createdAt: number;
        updatedAt: number;
    };
}

export type CreatePlatformOAuthAccountResult =
    | { status: "created"; identity: PlatformOAuthIdentity }
    | { status: "identity-conflict"; identity: PlatformOAuthIdentity };

/**
 * Which surface started an OAuth round trip: `web` returns with a document
 * redirect, `app` returns through a custom-scheme deep link carrying a
 * one-time exchange code. Orthogonal to `intent`, which names the flow
 * (`login` vs account `link`).
 */
export type PlatformOAuthClientTarget = "web" | "app";

/**
 * The two dimensions the callback needs from a state row before the row is
 * consumed: which surface started the round trip and which flow owns it. A
 * read of both in one row keeps the provider-denial early return from having
 * to guess the flow.
 */
export interface PlatformOAuthStateReturnChannel {
    clientTarget: PlatformOAuthClientTarget;
    intent: "login" | "link";
}

export interface PlatformOAuthStateRecord {
    state_hash: string;
    provider_code: PlatformOAuthProviderCode;
    intent: "login" | "link";
    linking_account_id: string | null;
    client_target: PlatformOAuthClientTarget;
    app_code_challenge: string | null;
    code_verifier: string | null;
    return_path: string;
    expires_at: number;
    created_at: number;
}

/**
 * A state row carries both dimensions on purpose. The database checks keep
 * them honest: a `link` row must carry `linkingAccountId`, and an `app` row
 * must carry the `appCodeChallenge` whose verifier never leaves the app
 * process. The callback reads `intent` to pick who owns the flow and
 * `clientTarget` to pick the return channel.
 */
export interface NewPlatformOAuthStateInput {
    stateHash: string;
    providerCode: PlatformOAuthProviderCode;
    intent: "login" | "link";
    linkingAccountId: string | null;
    clientTarget: PlatformOAuthClientTarget;
    appCodeChallenge: string | null;
    codeVerifier: string;
    returnPath: string;
    expiresAt: number;
    createdAt: number;
}

/**
 * A short-lived code handed to the app through a custom-scheme deep link.
 * Only the SHA-256 hash is stored; the raw code never touches the database,
 * and the row is deleted in the same statement that validates it.
 */
export interface PlatformOAuthExchangeCodeRecord {
    account_id: string;
    code_challenge: string;
}

export interface CreatePlatformOAuthExchangeCodeInput {
    codeHash: string;
    accountId: string;
    codeChallenge: string;
    expiresAt: number;
    createdAt: number;
}

/**
 * Linking a provider to an account that already exists. Deliberately not
 * `createOAuthAccount`, which builds a whole account and is login-only.
 *
 * `already-linked` is the idempotent re-bind of a link the account already
 * owns. `identity-conflict` means the provider subject belongs to another
 * account and no row was written. `provider-conflict` means this account
 * already has a different subject for that provider and must unlink first.
 * The uniqueness constraints on `platform_oauth_identities`, not a read
 * before the insert, decide the ownership race.
 */
export interface CreatePlatformOAuthIdentityForAccountInput {
    accountId: string;
    providerCode: PlatformOAuthProviderCode;
    providerSubject: string;
    providerDisplayName: string;
    providerAvatarUrl: string;
    createdAt: number;
    updatedAt: number;
    event: PlatformSecurityEventInput;
}

export type CreatePlatformOAuthIdentityForAccountResult =
    | { status: "created"; identity: PlatformOAuthIdentity }
    | { status: "already-linked"; identity: PlatformOAuthIdentity }
    | { status: "identity-conflict"; identity: PlatformOAuthIdentity }
    | { status: "provider-conflict" }
    | { status: "not-found" };

/**
 * Proof that the caller consumed a code from
 * `platform_email_verification_codes`. The domain hashes the code with a
 * purpose-specific prefix (`platform-email-binding\0`), so a binding code and
 * a registration code never collide even though they share the table.
 */
export interface PlatformEmailVerificationProof {
    codeHash: string;
    consumedToken: string;
    verifiedAt: number;
}

export interface CreatePlatformEmailCredentialInput {
    normalizedEmail: string;
    algorithm: "bcrypt";
    parametersJson: string;
    passwordHash: string;
    createdAt: number;
    updatedAt: number;
}

export interface CreateVerifiedEmailCredentialForAccountInput {
    accountId: string;
    credential: CreatePlatformEmailCredentialInput;
    verification: PlatformEmailVerificationProof;
    event: PlatformSecurityEventInput;
}

export type CreateVerifiedEmailCredentialForAccountResult =
    | { status: "created"; credential: PlatformEmailCredentialRecord }
    | { status: "already-bound"; credential: PlatformEmailCredentialRecord }
    | { status: "email-conflict" }
    | { status: "verification-invalid" };

/**
 * Moving an existing email credential to a new address. Only
 * `normalized_email` and `updated_at` change, so the password hash, algorithm
 * and salt survive the move. `expectedPasswordHash` / `expectedUpdatedAt`
 * fence the row the caller read, so a concurrent password change or second
 * migration loses the race instead of silently overwriting it.
 */
export interface MigrateEmailCredentialForAccountInput {
    accountId: string;
    currentNormalizedEmail: string;
    newNormalizedEmail: string;
    expectedPasswordHash: string;
    expectedUpdatedAt: number;
    updatedAt: number;
    verification: PlatformEmailVerificationProof;
    event: PlatformSecurityEventInput;
}

export type MigrateEmailCredentialForAccountResult =
    | { status: "migrated"; credential: PlatformEmailCredentialRecord }
    | { status: "not-bound" }
    | { status: "state-conflict" }
    | { status: "verification-invalid" }
    | { status: "email-conflict" };

// ── Admin platform-user management ────────────────────────────────────────

export type PlatformAccountAdminSearchField = "id" | "email" | "display_name";

/**
 * The admin surface's projection. It has no session row and no credential
 * secret: `active_session_count` answers "are they signed in" without handing
 * out `token_hash` / `previous_token_hash` / `csrf_hash`.
 */
export interface PlatformAccountAdminRecord {
    id: string;
    status: PlatformAccountStatus;
    display_name: string;
    normalized_email: string | null;
    has_password: boolean;
    active_session_count: number;
    last_login_at: number | null;
    created_at: number;
    updated_at: number;
}

export interface ListPlatformAccountsForAdminInput {
    field: PlatformAccountAdminSearchField;
    /** Already normalized by the domain; `null` lists every account. */
    query: string | null;
    limit: number;
    offset: number;
    /** The caller's clock, matching `listRefreshSessionsByAccount`. */
    activeAt: number;
}

export interface CountPlatformAccountsForAdminInput {
    field: PlatformAccountAdminSearchField;
    query: string | null;
}

/**
 * Suspension bumps `token_version` and revokes live refresh sessions in the
 * same batch, fenced on the status write: an access token cannot outlive the
 * ban, and sessions are not swept when the status write lost a race.
 * `expectedUpdatedAt` is the optimistic lock behind `REVISION_CONFLICT`.
 */
export interface SetPlatformAccountStatusInput {
    accountId: string;
    status: "active" | "suspended";
    expectedUpdatedAt: number;
    updatedAt: number;
    event: PlatformSecurityEventInput;
}

export type SetPlatformAccountStatusResult =
    | { status: "saved"; changed: boolean; account: PlatformAccountAdminRecord }
    | { status: "not-found" }
    | { status: "conflict"; account: PlatformAccountAdminRecord }
    | { status: "unsupported"; account: PlatformAccountAdminRecord };

export interface ForceLogoutPlatformAccountInput {
    accountId: string;
    revokedAt: number;
    event: PlatformSecurityEventInput;
}

export type ForceLogoutPlatformAccountResult =
    | { status: "saved"; revokedSessionCount: number }
    | { status: "not-found" };

export type CreatePlatformEmailAccountResult =
    | { status: "created"; identity: PlatformAccountWithProfile }
    | { status: "email-conflict" };

export interface CompletePlatformPasswordResetInput {
    normalizedEmail: string;
    codeHash: string;
    passwordHash: string;
    parametersJson: string;
    updatedAt: number;
    event: PlatformSecurityEventInput;
}

export type CompletePlatformPasswordResetResult =
    | { status: "completed"; account: PlatformAccountWithProfile }
    | { status: "invalid" };

export interface NewVerifiedPlatformEmailAccountInput
    extends NewPlatformEmailAccountInput {
    verification: {
        codeHash: string;
        consumedToken: string;
        verifiedAt: number;
    };
}

export type CreateVerifiedPlatformEmailAccountResult =
    | CreatePlatformEmailAccountResult
    | { status: "verification-invalid" };

export interface UpdatePlatformProfileTextInput {
    accountId: string;
    displayName: string;
    homeCity: string | null;
    bio: string;
    expectedUpdatedAt: number;
    updatedAt: number;
}

export interface UpdatePlatformProfileAvatarInput {
    accountId: string;
    avatarObjectKey: string | null;
    expectedUpdatedAt: number;
    updatedAt: number;
}

export type PlatformProfileSaveResult =
    | {
          status: "saved";
          profile: PlatformProfileRecord;
          previousAvatarObjectKey: string | null;
      }
    | { status: "conflict"; updatedAt: number }
    | { status: "unavailable" };

/**
 * Changing a password rewrites the credential, bumps `token_version` so every
 * issued access token dies, revokes every session except the caller's, and
 * re-arms that kept session with a refresh token minted for the new version.
 * All of it in one transaction: a partial apply would either strand the caller
 * on a dead token or leave a stolen session alive next to a new password.
 */
export interface UpdatePlatformPasswordInput {
    accountId: string;
    expectedPasswordHash: string;
    expectedUpdatedAt: number;
    passwordHash: string;
    parametersJson: string;
    keepSessionId: string;
    keepSessionTokenHash: string;
    keepSessionExpiresAt: number;
    updatedAt: number;
    event: PlatformSecurityEventInput;
}

export type UpdatePlatformPasswordResult =
    | { status: "saved"; tokenVersion: number; revokedSessionCount: number }
    | { status: "conflict" }
    | { status: "unavailable" };

export interface RevokePlatformRefreshSessionsInput {
    accountId: string;
    keepSessionId: string;
    revokedAt: number;
    event: PlatformSecurityEventInput;
}

export interface PlatformRefreshSessionRecord {
    id: string;
    account_id: string;
    token_hash: string;
    previous_token_hash: string | null;
    csrf_hash: string;
    expires_at: number;
    created_at: number;
    updated_at: number;
    revoked_at: number | null;
    user_agent: string | null;
    ip_address: string | null;
    last_seen_at: number | null;
}

export type PlatformSecurityEventType =
    | "auth.session.created"
    | "auth.refresh.succeeded"
    | "auth.refresh.replay"
    | "auth.logout"
    | "auth.account_blocked"
    | "auth.oauth.account_created"
    | "auth.password_reset.completed"
    | "auth.password.changed"
    | "auth.oauth.unlinked"
    | "auth.oauth.linked"
    | "auth.email.bound"
    | "auth.email.changed"
    | "auth.account.reactivated"
    | "auth.session.revoked";

export interface PlatformSecurityEventInput {
    id: string;
    accountId: string;
    eventType: PlatformSecurityEventType;
    requestId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    metadataJson: string;
    createdAt: number;
}

export interface NewPlatformRefreshSessionInput {
    id: string;
    accountId: string;
    accountTokenVersion: number;
    tokenHash: string;
    csrfHash: string;
    expiresAt: number;
    createdAt: number;
    // Optional because imported and bootstrap sessions have no request behind
    // them; the columns are nullable for the same reason.
    userAgent?: string | null;
    ipAddress?: string | null;
    event: PlatformSecurityEventInput;
}

export interface PlatformAccountRepository extends PlatformOAuthProviderStore {
    createAccountWithProfile(
        input: NewPlatformAccountInput,
    ): Promise<PlatformAccountWithProfile>;
    createOAuthState(input: NewPlatformOAuthStateInput): Promise<void>;
    consumeOAuthState(
        stateHash: string,
        providerCode: PlatformOAuthProviderCode,
        consumedAt: number,
    ): Promise<PlatformOAuthStateRecord | null>;
    /**
     * Read-only look at who started a state row, used only when a provider
     * denies the request before the callback can consume it. The return
     * channel tells an app round trip to stop waiting; `intent` tells a link
     * round trip to keep its `flow=link` key. The web login flow keeps its
     * `/account/login` redirect. Does not consume the row.
     */
    findOAuthStateReturnChannel(
        stateHash: string,
        providerCode: PlatformOAuthProviderCode,
        now: number,
    ): Promise<PlatformOAuthStateReturnChannel | null>;
    findOAuthIdentity(
        providerCode: PlatformOAuthProviderCode,
        providerSubject: string,
    ): Promise<PlatformOAuthIdentity | null>;
    listOAuthIdentitiesByAccount(
        accountId: string,
    ): Promise<PlatformOAuthLinkRecord[]>;
    /**
     * Unlinks one provider, refusing when it is the account's last usable way
     * to sign in. The check lives inside the delete statement, not in a read
     * before it: two concurrent unlinks that each read "there is still another
     * one" would otherwise both commit and lock the account out.
     */
    deleteOAuthIdentity(
        input: DeletePlatformOAuthIdentityInput,
    ): Promise<DeletePlatformOAuthIdentityResult>;
    createOAuthAccount(
        input: NewPlatformOAuthAccountInput,
    ): Promise<CreatePlatformOAuthAccountResult>;
    createOAuthIdentityForAccount(
        input: CreatePlatformOAuthIdentityForAccountInput,
    ): Promise<CreatePlatformOAuthIdentityForAccountResult>;
    createOAuthExchangeCode(
        input: CreatePlatformOAuthExchangeCodeInput,
    ): Promise<void>;
    /**
     * Deletes and returns in one statement, so two concurrent exchanges cannot
     * both redeem the same code. Expired rows are not returned.
     */
    consumeOAuthExchangeCode(
        codeHash: string,
        consumedAt: number,
    ): Promise<PlatformOAuthExchangeCodeRecord | null>;
    findAccountById(id: string): Promise<PlatformAccountRecord | null>;
    findAccountWithProfileById(
        id: string,
    ): Promise<PlatformAccountWithProfile | null>;
    createEmailAccount(
        input: NewPlatformEmailAccountInput,
    ): Promise<CreatePlatformEmailAccountResult>;
    createVerifiedEmailAccount(
        input: NewVerifiedPlatformEmailAccountInput,
    ): Promise<CreateVerifiedPlatformEmailAccountResult>;
    createVerifiedEmailCredentialForAccount(
        input: CreateVerifiedEmailCredentialForAccountInput,
    ): Promise<CreateVerifiedEmailCredentialForAccountResult>;
    migrateEmailCredentialForAccount(
        input: MigrateEmailCredentialForAccountInput,
    ): Promise<MigrateEmailCredentialForAccountResult>;
    completePasswordReset(
        input: CompletePlatformPasswordResetInput,
    ): Promise<CompletePlatformPasswordResetResult>;
    findEmailIdentity(
        normalizedEmail: string,
    ): Promise<PlatformEmailIdentity | null>;
    findEmailCredentialByAccountId(
        accountId: string,
    ): Promise<PlatformEmailCredentialRecord | null>;
    updatePasswordForAccount(
        input: UpdatePlatformPasswordInput,
    ): Promise<UpdatePlatformPasswordResult>;
    upgradeEmailCredentialToBcrypt(input: {
        normalizedEmail: string;
        expectedAlgorithm: "pbkdf2-sha256";
        expectedPasswordHash: string;
        expectedUpdatedAt: number;
        passwordHash: string;
        parametersJson: string;
        updatedAt: number;
    }): Promise<boolean>;
    updateProfileTextForOwner(
        input: UpdatePlatformProfileTextInput,
    ): Promise<PlatformProfileSaveResult>;
    updateProfileAvatarForOwner(
        input: UpdatePlatformProfileAvatarInput,
    ): Promise<PlatformProfileSaveResult>;
    createRefreshSession(
        input: NewPlatformRefreshSessionInput,
    ): Promise<boolean>;
    findRefreshSessionById(
        id: string,
    ): Promise<PlatformRefreshSessionRecord | null>;
    findRefreshSessionByTokenHash(
        tokenHash: string,
    ): Promise<PlatformRefreshSessionRecord | null>;
    // `activeAt` is the caller's clock, matching deleteExpiredRefreshSessions:
    // the repository never decides on its own what counts as expired.
    listRefreshSessionsByAccount(
        accountId: string,
        activeAt: number,
    ): Promise<PlatformRefreshSessionRecord[]>;
    rotateRefreshSession(input: {
        id: string;
        accountTokenVersion: number;
        currentTokenHash: string;
        nextTokenHash: string;
        nextCsrfHash: string;
        nextExpiresAt: number;
        updatedAt: number;
        event: PlatformSecurityEventInput;
    }): Promise<boolean>;
    revokeRefreshSession(input: {
        id: string;
        accountId: string;
        revokedAt: number;
        event: PlatformSecurityEventInput;
    }): Promise<boolean>;
    revokeAllRefreshSessionsExcept(
        input: RevokePlatformRefreshSessionsInput,
    ): Promise<number>;
    revokeRefreshSessionForReplay(input: {
        id: string;
        accountId: string;
        replayedTokenHash: string;
        revokedAt: number;
        event: PlatformSecurityEventInput;
    }): Promise<boolean>;
    deleteExpiredRefreshSessions(now: number): Promise<void>;
    listPlatformAccountsForAdmin(
        input: ListPlatformAccountsForAdminInput,
    ): Promise<PlatformAccountAdminRecord[]>;
    countPlatformAccountsForAdmin(
        input: CountPlatformAccountsForAdminInput,
    ): Promise<number>;
    setPlatformAccountStatus(
        input: SetPlatformAccountStatusInput,
    ): Promise<SetPlatformAccountStatusResult>;
    forceLogoutPlatformAccount(
        input: ForceLogoutPlatformAccountInput,
    ): Promise<ForceLogoutPlatformAccountResult>;
}

export interface WikiStorySourcePlatformRecord {
    id: number;
    name: string;
    homepage_url: string;
    description: string;
    display_order: number;
    is_active: boolean;
    revision: number;
}

export interface WikiStorySourcePlatformInput
    extends WikiStoryCatalogOptionInput {
    homepageUrl: string;
}
