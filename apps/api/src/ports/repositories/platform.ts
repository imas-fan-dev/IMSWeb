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

export interface PlatformOAuthStateRecord {
    state_hash: string;
    provider_code: PlatformOAuthProviderCode;
    intent: "login" | "link";
    linking_account_id: string | null;
    code_verifier: string | null;
    return_path: string;
    expires_at: number;
    created_at: number;
}

export interface NewPlatformOAuthStateInput {
    stateHash: string;
    providerCode: PlatformOAuthProviderCode;
    intent: "login";
    codeVerifier: string;
    returnPath: string;
    expiresAt: number;
    createdAt: number;
}

export type CreatePlatformEmailAccountResult =
    | { status: "created"; identity: PlatformAccountWithProfile }
    | { status: "email-conflict" };

export interface PlatformPasswordResetInput {
    normalizedEmail: string;
    deliveryToken: string;
    codeHash: string;
    expiresAt: number;
    resendAfter: number;
    attemptsRemaining: number;
    createdAt: number;
}

export type IssuePlatformPasswordResetResult =
    | { status: "issued" }
    | { status: "email-not-found" }
    | { status: "cooldown"; retryAfterMs: number };

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

export interface PlatformEmailVerificationInput {
    normalizedEmail: string;
    deliveryToken: string;
    codeHash: string;
    expiresAt: number;
    resendAfter: number;
    attemptsRemaining: number;
    createdAt: number;
}

export type IssuePlatformEmailVerificationResult =
    | { status: "issued" }
    | { status: "cooldown"; retryAfterMs: number };

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
}

export type PlatformSecurityEventType =
    | "auth.session.created"
    | "auth.refresh.succeeded"
    | "auth.refresh.replay"
    | "auth.logout"
    | "auth.account_blocked"
    | "auth.oauth.account_created"
    | "auth.password_reset.completed";

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
    findOAuthIdentity(
        providerCode: PlatformOAuthProviderCode,
        providerSubject: string,
    ): Promise<PlatformOAuthIdentity | null>;
    createOAuthAccount(
        input: NewPlatformOAuthAccountInput,
    ): Promise<CreatePlatformOAuthAccountResult>;
    findAccountById(id: string): Promise<PlatformAccountRecord | null>;
    findAccountWithProfileById(
        id: string,
    ): Promise<PlatformAccountWithProfile | null>;
    createEmailAccount(
        input: NewPlatformEmailAccountInput,
    ): Promise<CreatePlatformEmailAccountResult>;
    issueEmailVerification(
        input: PlatformEmailVerificationInput,
    ): Promise<IssuePlatformEmailVerificationResult>;
    completeEmailVerificationDelivery(
        normalizedEmail: string,
        deliveryToken: string,
    ): Promise<boolean>;
    revokeEmailVerification(
        normalizedEmail: string,
        deliveryToken: string,
    ): Promise<void>;
    createVerifiedEmailAccount(
        input: NewVerifiedPlatformEmailAccountInput,
    ): Promise<CreateVerifiedPlatformEmailAccountResult>;
    issuePasswordReset(
        input: PlatformPasswordResetInput,
    ): Promise<IssuePlatformPasswordResetResult>;
    completePasswordResetDelivery(
        normalizedEmail: string,
        deliveryToken: string,
    ): Promise<boolean>;
    revokePasswordReset(
        normalizedEmail: string,
        deliveryToken: string,
    ): Promise<void>;
    completePasswordReset(
        input: CompletePlatformPasswordResetInput,
    ): Promise<CompletePlatformPasswordResetResult>;
    findEmailIdentity(
        normalizedEmail: string,
    ): Promise<PlatformEmailIdentity | null>;
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
    revokeRefreshSessionForReplay(input: {
        id: string;
        accountId: string;
        replayedTokenHash: string;
        revokedAt: number;
        event: PlatformSecurityEventInput;
    }): Promise<boolean>;
    deleteExpiredRefreshSessions(now: number): Promise<void>;
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
