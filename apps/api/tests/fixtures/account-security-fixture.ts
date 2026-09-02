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
import type {
    DeletePlatformOAuthIdentityInput,
    DeletePlatformOAuthIdentityResult,
    PlatformAccountRepository,
    PlatformAccountStatus,
    PlatformEmailCredentialRecord,
    PlatformOAuthLinkRecord,
    PlatformRefreshSessionRecord,
    RevokePlatformRefreshSessionsInput,
    UpdatePlatformPasswordInput,
    UpdatePlatformPasswordResult
} from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';
import { ControlledRateLimiter, csrfHash } from './owner-route-fixture';

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

    readonly passwords: PasswordVerifier = {
        async hash(value: string) { return storedDigest(value); },
        async verify(value: string, digest: string) {
            return storedDigest(value) === digest;
        }
    };

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
            config: { cookieSecure: false }
        } as unknown as RuntimeServices;
    }
}

export function bearerHeaders(
    extra: Record<string, string> = {}
): Record<string, string> {
    return { authorization: `Bearer ${ACCESS_TOKEN}`, ...extra };
}

export function cookieHeaders(
    extra: Record<string, string> = {}
): Record<string, string> {
    return {
        cookie: `${PLATFORM_ACCESS_TOKEN_COOKIE}=${ACCESS_TOKEN}; ` +
            `${PLATFORM_CSRF_TOKEN_COOKIE}=${CSRF_SECRET}`,
        'x-csrftoken': CSRF_SECRET,
        ...extra
    };
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
