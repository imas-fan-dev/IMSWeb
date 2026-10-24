/**
 * Platform account-security route fixture.
 *
 * Owner-route tests already have `owner-route-fixture.ts`, but this slice needs
 * state that fixture has no reason to carry: an email credential, a password
 * verifier, OAuth links, and several refresh sessions across two accounts.
 * Rather than widen
 * the shared fixture for every one of its existing users, this one models the
 * same ports in the same style and reuses its rate limiter and hashing helper.
 */
import { createHonoApp } from '@/app';
import {
    PLATFORM_ACCESS_TOKEN_COOKIE,
    PLATFORM_CSRF_TOKEN_COOKIE
} from '@/domains/identity/platform-auth/contracts/session';
import type { PasswordVerifier } from '@/ports/security';
import type { PlatformOAuthClient, PlatformOAuthIdentityProfile, PlatformOAuthProviderSummary } from '@/ports/oauth';
import type {
    CreatePlatformOAuthExchangeCodeInput,
    CreatePlatformOAuthIdentityForAccountInput,
    CreatePlatformOAuthIdentityForAccountResult,
    CreateVerifiedEmailCredentialForAccountInput,
    CreateVerifiedEmailCredentialForAccountResult,
    DeletePlatformOAuthIdentityInput,
    DeletePlatformOAuthIdentityResult,
    MigrateEmailCredentialForAccountInput,
    MigrateEmailCredentialForAccountResult,
    NewPlatformOAuthStateInput,
    PlatformAccountRepository,
    PlatformAccountStatus,
    PlatformEmailCredentialRecord,
    PlatformOAuthIdentity,
    PlatformOAuthLinkRecord,
    PlatformOAuthStateRecord,
    PlatformRefreshSessionRecord,
    RevokePlatformRefreshSessionsInput,
    UpdatePlatformPasswordInput,
    UpdatePlatformPasswordResult
} from '@/ports/repositories';
import { hashOAuthStateValue } from '@/domains/identity/platform-auth/contracts/oauth-pkce';
import { hashPlatformEmailBindingCode } from '@/domains/identity/platform-account-security/email/email-binding-code';
import type { RuntimeServices } from '@/ports/runtime-services';
import {
    bearerTokenHeaders,
    cookieCsrfHeaders,
    fixtureSha256Hex as csrfHash
} from './auth-request';
import { ControlledRateLimiter } from './owner-route-fixture';

export const ACCOUNT_ID = 'platform-secure-owner';
export const FOREIGN_ACCOUNT_ID = 'platform-secure-stranger';
export const CURRENT_SESSION_ID = 'session-current';
export const SECOND_DEVICE_SESSION_ID = 'session-second-device';
export const THIRD_DEVICE_SESSION_ID = 'session-third-device';
export const FOREIGN_SESSION_ID = 'session-foreign';
export const REVOKED_SESSION_ID = 'session-revoked';
export const EXPIRED_SESSION_ID = 'session-expired';
export const ACCESS_TOKEN = 'security-access-token';
export const CSRF_SECRET = 'security-csrf-secret';
export const CURRENT_PASSWORD = 'current-password-1';
export const NEXT_PASSWORD = 'replacement-password-2';
export const GOOGLE_PROVIDER = 'google';
export const GITHUB_PROVIDER = 'github';
// A provider row with `enabled = FALSE`: still linkable in the table, but it
// cannot complete a sign-in, which is the whole point of the unlink guard.
export const DISABLED_PROVIDER = 'legacy-sso';
export const FOREIGN_PROVIDER = 'gitlab';

const PROVIDER_LABELS: Record<string, string> = {
    [GOOGLE_PROVIDER]: 'Google',
    [GITHUB_PROVIDER]: 'GitHub',
    [DISABLED_PROVIDER]: 'Legacy SSO',
    [FOREIGN_PROVIDER]: 'GitLab'
};

/**
 * The stored row, which carries `provider_subject` exactly as the real table
 * does. The list stub projects it away, mirroring the repository's select list,
 * so the "never on the wire" test has a real value to search the response for
 * rather than merely asserting that an absent field stayed absent.
 */
export interface StoredOAuthLink extends PlatformOAuthLinkRecord {
    account_id: string;
    provider_subject: string;
}

export function oauthLink(
    providerCode: string,
    overrides: Partial<StoredOAuthLink> = {}
): StoredOAuthLink {
    return {
        account_id: ACCOUNT_ID,
        provider_code: providerCode,
        provider_subject: `subject-${providerCode}-987654321`,
        provider_label: PROVIDER_LABELS[providerCode] ?? providerCode,
        provider_enabled: true,
        provider_display_name: `${providerCode} person`,
        provider_avatar_url: `https://cdn.example.test/${providerCode}.png`,
        created_at: 3_000,
        ...overrides
    };
}

// A transparent stand-in for bcrypt: the tests care about which secret was
// presented, not about the cost factor.
export function storedDigest(password: string): string {
    return `hashed:${password}`;
}

const HOUR_MS = 60 * 60 * 1000;

function session(
    id: string,
    accountId: string,
    overrides: Partial<PlatformRefreshSessionRecord> = {}
): PlatformRefreshSessionRecord {
    const createdAt = 1_000;
    return {
        id,
        account_id: accountId,
        token_hash: `token-hash-${id}`,
        previous_token_hash: null,
        csrf_hash: csrfHash(CSRF_SECRET),
        expires_at: Date.now() + 24 * HOUR_MS,
        created_at: createdAt,
        updated_at: createdAt,
        revoked_at: null,
        user_agent: `agent/${id}`,
        ip_address: '203.0.113.7',
        last_seen_at: createdAt,
        ...overrides
    };
}

export interface AccountSecurityFixtureOptions {
    accountStatus?: PlatformAccountStatus;
    credential?: PlatformEmailCredentialRecord | null;
    oauthLinks?: StoredOAuthLink[];
    oauthProviders?: PlatformOAuthProviderSummary[];
    foreignEmails?: string[];
}

/** One row of the shared verification-code table, reduced to the columns the
 * binding repository clauses actually read. */
export interface StoredVerificationCode {
    codeHash: string;
    consumedToken: string | null;
    expiresAt: number;
    attemptsRemaining: number;
    deliveryToken: string | null;
}

export class AccountSecurityFixture {
    accountStatus: PlatformAccountStatus;
    tokenVersion = 0;
    credential: PlatformEmailCredentialRecord | null;
    readonly sessions = new Map<string, PlatformRefreshSessionRecord>();
    readonly rateLimiter = new ControlledRateLimiter();
    readonly signedTokenVersions: number[] = [];
    readonly passwordInputs: UpdatePlatformPasswordInput[] = [];
    readonly unlinkInputs: DeletePlatformOAuthIdentityInput[] = [];
    oauthLinks: StoredOAuthLink[];
    readonly verificationCodes = new Map<string, StoredVerificationCode>();
    /** The raw code the stub cipher saw, so a test can submit what the mail carried. */
    readonly emailedCodes = new Map<string, string>();
    readonly emailEnqueues: Array<{ normalizedEmail: string; codeHash: string; createdAt: number }> = [];
    readonly emailBindingInputs: CreateVerifiedEmailCredentialForAccountInput[] = [];
    readonly emailMigrationInputs: MigrateEmailCredentialForAccountInput[] = [];
    readonly oauthStateInputs: NewPlatformOAuthStateInput[] = [];
    readonly oauthStateRows = new Map<string, PlatformOAuthStateRecord>();
    readonly oauthExchangeCodeInputs: CreatePlatformOAuthExchangeCodeInput[] = [];
    readonly oauthIdentityInputs: CreatePlatformOAuthIdentityForAccountInput[] = [];
    /** Overrides the link write outcome; defaults to a fresh `created` link. */
    oauthLinkResult: CreatePlatformOAuthIdentityForAccountResult | null = null;
    oauthProfile: PlatformOAuthIdentityProfile = {
        providerCode: GITHUB_PROVIDER,
        subject: `subject-${GITHUB_PROVIDER}-987654321`,
        displayName: 'github person',
        avatarUrl: null
    };
    readonly foreignEmails: Set<string>;
    oauthProviders: PlatformOAuthProviderSummary[];
    oauthAuthorizationUrl: URL | null = new URL(
        'https://github.example.test/authorize'
    );
    readonly app: ReturnType<typeof createHonoApp>;

    constructor(options: AccountSecurityFixtureOptions = {}) {
        this.accountStatus = options.accountStatus ?? 'active';
        this.credential = options.credential === undefined
            ? {
                normalized_email: 'owner@example.test',
                account_id: ACCOUNT_ID,
                algorithm: 'bcrypt',
                parameters_json: '{}',
                salt: null,
                password_hash: storedDigest(CURRENT_PASSWORD),
                created_at: 1_000,
                updated_at: 1_000
            }
            : options.credential;
        // A foreign link is always present so "unlinking somebody else's
        // provider" has something real to fail against.
        this.oauthLinks = [
            ...(options.oauthLinks ?? [oauthLink(GOOGLE_PROVIDER)]),
            oauthLink(FOREIGN_PROVIDER, { account_id: FOREIGN_ACCOUNT_ID })
        ];
        this.foreignEmails = new Set(options.foreignEmails ?? []);
        this.oauthProviders = options.oauthProviders ?? [
            {
                code: GITHUB_PROVIDER,
                displayName: 'GitHub',
                icon: 'github',
                buttonColor: '#24292f'
            }
        ];
        for (const record of [
            session(CURRENT_SESSION_ID, ACCOUNT_ID),
            session(SECOND_DEVICE_SESSION_ID, ACCOUNT_ID),
            session(THIRD_DEVICE_SESSION_ID, ACCOUNT_ID),
            session(FOREIGN_SESSION_ID, FOREIGN_ACCOUNT_ID),
            session(REVOKED_SESSION_ID, ACCOUNT_ID, { revoked_at: 2_000 }),
            session(EXPIRED_SESSION_ID, ACCOUNT_ID, {
                expires_at: Date.now() - HOUR_MS
            })
        ]) {
            this.sessions.set(record.id, record);
        }
        this.app = createHonoApp(() => this.runtime());
    }

    liveSessionIds(accountId = ACCOUNT_ID): string[] {
        return [...this.sessions.values()]
            .filter((record) =>
                record.account_id === accountId &&
                record.revoked_at === null &&
                record.expires_at > Date.now())
            .map((record) => record.id)
            .sort();
    }

    linkedProviders(accountId = ACCOUNT_ID): string[] {
        return this.oauthLinks
            .filter((link) => link.account_id === accountId)
            .map((link) => link.provider_code)
            .sort();
    }

    /**
     * Seeds the verification-code table with a binding-domain hash. The domain
     * function is shared on purpose: the fixture mirrors the storage side of
     * the protocol, not the hash derivation.
     */
    issueEmailBindingCode(
        email: string,
        code: string,
        overrides: Partial<StoredVerificationCode> = {}
    ): void {
        this.emailedCodes.set(email, code);
        this.verificationCodes.set(email, {
            codeHash: hashPlatformEmailBindingCode(email, code),
            consumedToken: null,
            expiresAt: Date.now() + 10 * 60_000,
            attemptsRemaining: 5,
            deliveryToken: null,
            ...overrides
        });
    }

    private foreignIdentity() {
        return {
            account: {
                id: FOREIGN_ACCOUNT_ID,
                status: 'active' as const,
                token_version: 0,
                created_at: 500,
                updated_at: 500,
                deleted_at: null
            },
            profile: {
                account_id: FOREIGN_ACCOUNT_ID,
                display_name: 'Foreign Owner',
                avatar_object_key: null,
                avatar_external_url: null,
                home_city: null,
                bio: '',
                updated_at: 500
            }
        };
    }

    // One source of truth for "does this account have a password", so the list
    // stub and the unlink stub can never disagree about it.
    private credentialFor(accountId: string): PlatformEmailCredentialRecord | null {
        return accountId === ACCOUNT_ID && this.credential
            ? { ...this.credential }
            : null;
    }

    private identity() {
        return {
            account: {
                id: ACCOUNT_ID,
                status: this.accountStatus,
                token_version: this.tokenVersion,
                created_at: 500,
                updated_at: 500,
                deleted_at: this.accountStatus === 'deleted' ? 500 : null
            },
            profile: {
                account_id: ACCOUNT_ID,
                display_name: 'Secure Owner',
                avatar_object_key: null,
                avatar_external_url: null,
                home_city: null,
                bio: '',
                updated_at: 1_000
            }
        };
    }

    private oauthIdentity(): PlatformOAuthIdentity {
        return {
            ...this.identity(),
            oauth: {
                provider_code: GITHUB_PROVIDER,
                provider_subject: this.oauthProfile.subject,
                account_id: ACCOUNT_ID,
                provider_display_name: this.oauthProfile.displayName,
                provider_avatar_url: this.oauthProfile.avatarUrl ?? '',
                created_at: 1_000,
                updated_at: 1_000
            }
        };
    }

    readonly passwords: PasswordVerifier = {
        async hash(value: string) { return storedDigest(value); },
        async verify(value: string, digest: string) {
            return storedDigest(value) === digest;
        }
    };

    /**
     * Seeds the state table with the raw state the callback will present, so a
     * test can build `?state=<raw>` without knowing the server's PKCE pair.
     */
    issueOAuthState(
        rawState: string,
        overrides: Partial<PlatformOAuthStateRecord> = {}
    ): void {
        const stateHash = hashOAuthStateValue(rawState);
        this.oauthStateRows.set(stateHash, {
            state_hash: stateHash,
            provider_code: GITHUB_PROVIDER,
            intent: 'link',
            linking_account_id: ACCOUNT_ID,
            client_target: 'web',
            app_code_challenge: null,
            code_verifier: 'v'.repeat(43),
            return_path: '/account/security',
            expires_at: Date.now() + 10 * 60_000,
            created_at: Date.now(),
            ...overrides
        });
    }

    readonly platformAccounts = {
        findRefreshSessionById: async (id: string) => {
            const record = this.sessions.get(id);
            return record ? { ...record } : null;
        },
        findAccountWithProfileById: async (id: string) =>
            id === ACCOUNT_ID ? this.identity() : null,
        findEmailCredentialByAccountId: async (accountId: string) =>
            this.credentialFor(accountId),
        // Mirrors the repository's select list: `provider_subject` is projected
        // away here exactly as it is never selected there, and the JOIN onto
        // platform_oauth_providers supplies the label and the enabled flag.
        listOAuthIdentitiesByAccount: async (
            accountId: string
        ): Promise<PlatformOAuthLinkRecord[]> => this.oauthLinks
            .filter((link) => link.account_id === accountId)
            .sort((left, right) =>
                left.created_at - right.created_at ||
                left.provider_code.localeCompare(right.provider_code))
            .map((link) => ({
                provider_code: link.provider_code,
                provider_label: link.provider_label,
                provider_enabled: link.provider_enabled,
                provider_display_name: link.provider_display_name,
                provider_avatar_url: link.provider_avatar_url,
                created_at: link.created_at
            })),
        /**
         * Mirrors `deleteOAuthIdentity`, clause for clause:
         *
         * - `WHERE account_id=? AND provider_code=?` -> the `target` lookup,
         *   which is why a foreign or unknown provider reports not-found.
         * - `EXISTS (SELECT 1 FROM platform_email_credentials ...)` -> the
         *   `hasPassword` term.
         * - `EXISTS (SELECT 1 FROM platform_oauth_identities survivor JOIN
         *   platform_oauth_providers provider ... WHERE survivor.account_id=?
         *   AND survivor.provider_code<>? AND provider.enabled=TRUE)` ->
         *   `enabledSurvivor`. The `provider_enabled` term is that JOIN: drop
         *   it here and the stub would accept an unlink the database refuses.
         */
        deleteOAuthIdentity: async (
            input: DeletePlatformOAuthIdentityInput
        ): Promise<DeletePlatformOAuthIdentityResult> => {
            this.unlinkInputs.push(input);
            const owned = this.oauthLinks.filter(
                (link) => link.account_id === input.accountId
            );
            const target = owned.find(
                (link) => link.provider_code === input.providerCode
            );
            if (!target) return { status: 'not-found' };
            const hasPassword = this.credentialFor(input.accountId) !== null;
            const enabledSurvivor = owned.some((link) =>
                link.provider_code !== input.providerCode &&
                link.provider_enabled);
            if (!hasPassword && !enabledSurvivor) {
                return { status: 'last-login-method' };
            }
            this.oauthLinks = this.oauthLinks.filter(
                (link) => link !== target
            );
            return { status: 'deleted' };
        },
        findEmailIdentity: async (email: string) => {
            const credential = this.credentialFor(ACCOUNT_ID);
            if (credential && credential.normalized_email === email) {
                return { ...this.identity(), credential: { ...credential } };
            }
            if (this.foreignEmails.has(email)) {
                return {
                    ...this.foreignIdentity(),
                    credential: {
                        normalized_email: email,
                        account_id: FOREIGN_ACCOUNT_ID,
                        algorithm: 'bcrypt' as const,
                        parameters_json: '{}',
                        salt: null,
                        password_hash: storedDigest('foreign-secret'),
                        created_at: 500,
                        updated_at: 500
                    }
                };
            }
            return null;
        },
        // Mirrors the repository batch: the credential fence runs first, the
        // code must still be unconsumed and undelivered, the target address
        // must be free, and only then is the code spent and the row written.
        createVerifiedEmailCredentialForAccount: async (
            input: CreateVerifiedEmailCredentialForAccountInput
        ): Promise<CreateVerifiedEmailCredentialForAccountResult> => {
            this.emailBindingInputs.push(input);
            const existing = this.credentialFor(input.accountId);
            if (existing) {
                return { status: 'already-bound', credential: { ...existing } };
            }
            const code = this.verificationCodes.get(input.credential.normalizedEmail);
            if (
                !code ||
                code.deliveryToken !== null ||
                code.consumedToken !== null ||
                code.expiresAt <= input.verification.verifiedAt ||
                code.attemptsRemaining <= 0 ||
                code.codeHash !== input.verification.codeHash
            ) {
                return { status: 'verification-invalid' };
            }
            if (this.foreignEmails.has(input.credential.normalizedEmail)) {
                return { status: 'email-conflict' };
            }
            code.consumedToken = input.verification.consumedToken;
            this.verificationCodes.delete(input.credential.normalizedEmail);
            this.credential = {
                normalized_email: input.credential.normalizedEmail,
                account_id: input.accountId,
                algorithm: 'bcrypt',
                parameters_json: input.credential.parametersJson,
                salt: null,
                password_hash: input.credential.passwordHash,
                created_at: input.credential.createdAt,
                updated_at: input.credential.updatedAt
            };
            return { status: 'created', credential: { ...this.credential } };
        },
        // Moving in place: only the address and `updated_at` change, and the
        // fence is the exact credential the handler read.
        migrateEmailCredentialForAccount: async (
            input: MigrateEmailCredentialForAccountInput
        ): Promise<MigrateEmailCredentialForAccountResult> => {
            this.emailMigrationInputs.push(input);
            const current = this.credentialFor(input.accountId);
            if (!current) return { status: 'not-bound' };
            if (
                current.normalized_email !== input.currentNormalizedEmail ||
                current.password_hash !== input.expectedPasswordHash ||
                current.updated_at !== input.expectedUpdatedAt
            ) {
                return { status: 'state-conflict' };
            }
            const code = this.verificationCodes.get(input.newNormalizedEmail);
            if (
                !code ||
                code.deliveryToken !== null ||
                code.consumedToken !== null ||
                code.expiresAt <= input.verification.verifiedAt ||
                code.attemptsRemaining <= 0 ||
                code.codeHash !== input.verification.codeHash
            ) {
                return { status: 'verification-invalid' };
            }
            if (this.foreignEmails.has(input.newNormalizedEmail)) {
                return { status: 'email-conflict' };
            }
            code.consumedToken = input.verification.consumedToken;
            this.verificationCodes.delete(input.newNormalizedEmail);
            this.credential = {
                ...current,
                normalized_email: input.newNormalizedEmail,
                updated_at: input.updatedAt
            };
            return { status: 'migrated', credential: { ...this.credential } };
        },
        createOAuthState: async (input: NewPlatformOAuthStateInput) => {
            this.oauthStateInputs.push(input);
            this.oauthStateRows.set(input.stateHash, {
                state_hash: input.stateHash,
                provider_code: input.providerCode,
                intent: input.intent,
                linking_account_id: input.linkingAccountId,
                client_target: input.clientTarget,
                app_code_challenge: input.appCodeChallenge,
                code_verifier: input.codeVerifier,
                return_path: input.returnPath,
                expires_at: input.expiresAt,
                created_at: input.createdAt
            });
        },
        // Mirrors the real DELETE ... RETURNING: the row is removed only when
        // it still matches the provider and has not expired.
        consumeOAuthState: async (
            stateHash: string,
            providerCode: string,
            consumedAt: number
        ): Promise<PlatformOAuthStateRecord | null> => {
            const row = this.oauthStateRows.get(stateHash);
            if (
                !row ||
                row.provider_code !== providerCode ||
                row.expires_at <= consumedAt
            ) {
                return null;
            }
            this.oauthStateRows.delete(stateHash);
            return { ...row };
        },
        findOAuthStateReturnChannel: async (
            stateHash: string,
            providerCode: string,
            now: number
        ) => {
            const row = this.oauthStateRows.get(stateHash);
            if (
                !row ||
                row.provider_code !== providerCode ||
                row.expires_at <= now
            ) {
                return null;
            }
            return { clientTarget: row.client_target, intent: row.intent };
        },
        createOAuthIdentityForAccount: async (
            input: CreatePlatformOAuthIdentityForAccountInput
        ): Promise<CreatePlatformOAuthIdentityForAccountResult> => {
            this.oauthIdentityInputs.push(input);
            return this.oauthLinkResult ?? {
                status: 'created',
                identity: this.oauthIdentity()
            };
        },
        createOAuthExchangeCode: async (
            input: CreatePlatformOAuthExchangeCodeInput
        ) => {
            this.oauthExchangeCodeInputs.push(input);
        },
        listRefreshSessionsByAccount: async (
            accountId: string,
            activeAt: number
        ) => [...this.sessions.values()]
            .filter((record) =>
                record.account_id === accountId &&
                record.revoked_at === null &&
                record.expires_at > activeAt)
            .map((record) => ({ ...record })),
        // Mirrors the repository batch: the credential fence decides the
        // outcome, and everything else only happens once it passes.
        updatePasswordForAccount: async (
            input: UpdatePlatformPasswordInput
        ): Promise<UpdatePlatformPasswordResult> => {
            this.passwordInputs.push(input);
            if (!this.credential || this.accountStatus !== 'active') {
                return { status: 'unavailable' };
            }
            if (
                this.credential.password_hash !== input.expectedPasswordHash ||
                this.credential.updated_at !== input.expectedUpdatedAt
            ) {
                return { status: 'conflict' };
            }
            this.credential = {
                ...this.credential,
                algorithm: 'bcrypt',
                parameters_json: input.parametersJson,
                salt: null,
                password_hash: input.passwordHash,
                updated_at: input.updatedAt
            };
            this.tokenVersion += 1;
            let revokedSessionCount = 0;
            for (const record of this.sessions.values()) {
                if (
                    record.account_id !== input.accountId ||
                    record.id === input.keepSessionId ||
                    record.revoked_at !== null ||
                    // Expiry bound, mirroring `AND expires_at>?` in the SQL.
                    record.expires_at <= input.updatedAt
                ) {
                    continue;
                }
                record.revoked_at = input.updatedAt;
                record.updated_at = input.updatedAt;
                revokedSessionCount += 1;
            }
            const kept = this.sessions.get(input.keepSessionId);
            if (kept && kept.revoked_at === null) {
                kept.token_hash = input.keepSessionTokenHash;
                kept.previous_token_hash = null;
                kept.expires_at = input.keepSessionExpiresAt;
                kept.updated_at = input.updatedAt;
                kept.last_seen_at = input.updatedAt;
            }
            return {
                status: 'saved',
                tokenVersion: this.tokenVersion,
                revokedSessionCount
            };
        },
        revokeRefreshSession: async (input: {
            id: string;
            accountId: string;
            revokedAt: number;
        }) => {
            const record = this.sessions.get(input.id);
            // Ownership is part of the write, exactly as in the SQL statement.
            if (
                !record || record.account_id !== input.accountId ||
                record.revoked_at !== null
            ) {
                return false;
            }
            record.revoked_at = input.revokedAt;
            record.updated_at = input.revokedAt;
            return true;
        },
        revokeAllRefreshSessionsExcept: async (
            input: RevokePlatformRefreshSessionsInput
        ) => {
            let revoked = 0;
            for (const record of this.sessions.values()) {
                if (
                    record.account_id !== input.accountId ||
                    record.id === input.keepSessionId ||
                    record.revoked_at !== null ||
                    // Expiry bound, mirroring `AND expires_at>?` in the SQL.
                    record.expires_at <= input.revokedAt
                ) {
                    continue;
                }
                record.revoked_at = input.revokedAt;
                record.updated_at = input.revokedAt;
                revoked += 1;
            }
            return revoked;
        }
    } as unknown as PlatformAccountRepository;

    runtime(): RuntimeServices {
        return {
            platformAccounts: this.platformAccounts,
            passwords: this.passwords,
            rateLimiter: this.rateLimiter,
            platformTokens: {
                sign: async (claims: { tokenVersion: number }) => {
                    this.signedTokenVersions.push(claims.tokenVersion);
                    return ACCESS_TOKEN;
                },
                // The client always presents the newest token it was handed, so
                // the stub reports the account's current version.
                verify: async (token: string) => {
                    if (token !== ACCESS_TOKEN) throw new Error('invalid token');
                    const now = Math.floor(Date.now() / 1000);
                    return {
                        iss: 'imsweb' as const,
                        aud: 'ims-platform' as const,
                        kind: 'platform' as const,
                        id: ACCOUNT_ID,
                        tokenVersion: this.tokenVersion,
                        sessionId: CURRENT_SESSION_ID,
                        csrfSecret: CSRF_SECRET,
                        jti: 'platform-access',
                        iat: now,
                        exp: now + 900
                    };
                }
            },
            config: { cookieSecure: false },
            platformEmailDeliveryQueue: {
                enqueueRegistration: async (input: {
                    normalizedEmail: string;
                    codeHash: string;
                    createdAt: number;
                }) => {
                    this.emailEnqueues.push({
                        normalizedEmail: input.normalizedEmail,
                        codeHash: input.codeHash,
                        createdAt: input.createdAt
                    });
                    this.verificationCodes.set(input.normalizedEmail, {
                        codeHash: input.codeHash,
                        consumedToken: null,
                        expiresAt: input.createdAt + 10 * 60_000,
                        attemptsRemaining: 5,
                        deliveryToken: null
                    });
                    return {
                        status: 'queued' as const,
                        resendAfter: input.createdAt + 30_000,
                        retryAfterSeconds: 30,
                        policyUpdatedAt: input.createdAt
                    };
                }
            },
            platformEmailJobPayloadCipher: {
                encrypt: (
                    identity: Record<string, unknown>,
                    payload: {
                        normalizedEmail: string;
                        code: string;
                    }
                ) => {
                    this.emailedCodes.set(payload.normalizedEmail, payload.code);
                    return {
                        ...identity,
                        normalizedEmail: payload.normalizedEmail,
                        payloadCiphertext: 'stub-ciphertext'
                    };
                },
                decrypt: () => {
                    throw new Error('not used');
                }
            },
            platformEmailResendPolicy: {
                getPolicy: async () => ({
                    resendCooldownSeconds: 30,
                    updatedAt: 1_000
                })
            },
            platformOAuth: {
                listProviders: async () => [...this.oauthProviders],
                createAuthorizationUrl: async () => this.oauthAuthorizationUrl,
                exchangeAuthorizationCode: async () => ({ ...this.oauthProfile })
            } as unknown as PlatformOAuthClient
        } as unknown as RuntimeServices;
    }
}

export function bearerHeaders(
    extra: Record<string, string> = {}
): Record<string, string> {
    return bearerTokenHeaders(ACCESS_TOKEN, extra);
}

export function cookieHeaders(
    extra: Record<string, string> = {}
): Record<string, string> {
    return cookieCsrfHeaders([
        [PLATFORM_ACCESS_TOKEN_COOKIE, ACCESS_TOKEN],
        [PLATFORM_CSRF_TOKEN_COOKIE, CSRF_SECRET]
    ], CSRF_SECRET, extra);
}

export function passwordBody(
    overrides: Record<string, unknown> = {}
): string {
    return JSON.stringify({
        currentPassword: CURRENT_PASSWORD,
        newPassword: NEXT_PASSWORD,
        ...overrides
    });
}
