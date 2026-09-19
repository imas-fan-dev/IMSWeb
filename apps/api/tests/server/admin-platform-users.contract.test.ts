import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
    adminPlatformUserDetailResponseSchema,
    adminPlatformUserHttpErrorSchema,
    adminPlatformUserListSchema,
    adminPlatformUserOAuthUnlinkResponseSchema,
    adminPlatformUserPasswordResetResponseSchema,
    adminPlatformUserSessionRevocationResponseSchema,
    adminPlatformUserStatusResponseSchema,
} from '@imsweb/contracts/platform/admin-users';
import { adminApiPath } from '@imsweb/contracts/paths';
import {
    BACKOFFICE_ACCESS_TOKEN_COOKIE,
    BACKOFFICE_CSRF_TOKEN_COOKIE,
} from '@/domains/admin/backoffice-auth/backoffice-auth-session';
import { MemoryCache } from '@/infra/cache/memory/cache';
import { HmacBackofficeTokenService } from '@/infra/security/hmac/token-service';
import type { RuntimeServices } from '@/ports/runtime-services';
import type {
    DeletePlatformOAuthIdentityResult,
    ForceLogoutPlatformAccountInput,
    ListPlatformAccountsForAdminInput,
    PlatformAccountAdminRecord,
    PlatformAccountAdminSearchField,
    PlatformOAuthLinkRecord,
    SetPlatformAccountStatusInput,
    SetPlatformAccountStatusResult,
} from '@/ports/repositories';
import { readContractJson as assertRawJsonConforms } from '../contracts/contract-json';
import { normalizeAdminPlatformUserListQuery } from '@/domains/admin/platform-users/request';
import { createTestApp, TEST_ORIGIN } from './test-app';

const USERS_URL = adminApiPath('/platform/users');

interface FakeAccount {
    id: string;
    status: 'active' | 'restricted' | 'suspended' | 'deleted';
    display_name: string;
    normalized_email: string | null;
    has_password: boolean;
    token_version: number;
    updated_at: number;
    created_at: number;
    deleted_at: number | null;
}

interface AuditEntry {
    action: string;
    target: string;
}

function escapeRegex(character: string): string {
    return character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Mirrors PostgreSQL `ILIKE ... ESCAPE '\'` for the fake: `%` and `_` are
// wildcards, a backslash makes the next character literal.
function likeToRegex(pattern: string): RegExp {
    let source = '';
    for (let index = 0; index < pattern.length; index += 1) {
        const character = pattern[index]!;
        if (character === '\\') {
            source += escapeRegex(pattern[index + 1] ?? '');
            index += 1;
        } else if (character === '%') {
            source += '.*';
        } else if (character === '_') {
            source += '.';
        } else {
            source += escapeRegex(character);
        }
    }
    return new RegExp(`^${source}$`, 'i');
}

class FakePlatformAccounts {
    readonly accounts = new Map<string, FakeAccount>();
    readonly links = new Map<string, PlatformOAuthLinkRecord[]>();
    readonly audit: AuditEntry[] = [];
    readonly sessionSweeps: string[] = [];
    statusWrites: SetPlatformAccountStatusInput[] = [];
    forceLogouts: ForceLogoutPlatformAccountInput[] = [];
    emailConfigured = true;
    unlinkResult: DeletePlatformOAuthIdentityResult | null = null;

    add(account: Partial<FakeAccount> & { id: string }) {
        this.accounts.set(account.id, {
            status: 'active',
            display_name: `User ${account.id}`,
            normalized_email: `${account.id}@example.com`,
            has_password: true,
            token_version: 0,
            updated_at: 100,
            created_at: 10,
            deleted_at: null,
            ...account,
        });
    }

    private matches(field: PlatformAccountAdminSearchField, query: string | null) {
        const all = [...this.accounts.values()].filter(
            (account) => account.deleted_at === null
        );
        if (query === null) return all;
        switch (field) {
            case 'id':
                return all.filter((account) => account.id === query);
            case 'email':
                return all.filter(
                    (account) => account.normalized_email === query
                );
            case 'display_name': {
                const pattern = likeToRegex(query);
                return all.filter((account) => pattern.test(account.display_name));
            }
        }
    }

    private project(account: FakeAccount): PlatformAccountAdminRecord {
        return {
            id: account.id,
            status: account.status,
            display_name: account.display_name,
            normalized_email: account.normalized_email,
            has_password: account.has_password,
            active_session_count:
                account.status === 'suspended' ? 0 : 2,
            last_login_at: 90,
            created_at: account.created_at,
            updated_at: account.updated_at,
        };
    }

    async listPlatformAccountsForAdmin(input: ListPlatformAccountsForAdminInput) {
        return this.matches(input.field, input.query)
            .sort(
                (left, right) =>
                    right.created_at - left.created_at ||
                    left.id.localeCompare(right.id)
            )
            .slice(input.offset, input.offset + input.limit)
            .map((account) => this.project(account));
    }

    async countPlatformAccountsForAdmin(input: {
        field: PlatformAccountAdminSearchField;
        query: string | null;
    }) {
        return this.matches(input.field, input.query).length;
    }

    async setPlatformAccountStatus(
        input: SetPlatformAccountStatusInput
    ): Promise<SetPlatformAccountStatusResult> {
        this.statusWrites.push(input);
        const account = this.accounts.get(input.accountId);
        if (!account || account.deleted_at !== null) {
            return { status: 'not-found' };
        }
        if (account.updated_at !== input.expectedUpdatedAt) {
            return { status: 'conflict', account: this.project(account) };
        }
        if (account.status === input.status) {
            return { status: 'saved', changed: false, account: this.project(account) };
        }
        if (input.status === 'active' && account.status !== 'suspended') {
            return { status: 'unsupported', account: this.project(account) };
        }
        account.status = input.status;
        account.updated_at = input.updatedAt;
        if (input.status === 'suspended') {
            account.token_version += 1;
            this.sessionSweeps.push(account.id);
        }
        return { status: 'saved', changed: true, account: this.project(account) };
    }

    async forceLogoutPlatformAccount(input: ForceLogoutPlatformAccountInput) {
        this.forceLogouts.push(input);
        const account = this.accounts.get(input.accountId);
        if (!account || account.deleted_at !== null) {
            return { status: 'not-found' as const };
        }
        account.token_version += 1;
        return {
            status: 'saved' as const,
            revokedSessionCount: this.sessionSweeps.includes(account.id) ? 0 : 3,
        };
    }

    async listOAuthIdentitiesByAccount(accountId: string) {
        return this.links.get(accountId) ?? [];
    }

    async deleteOAuthIdentity(input: {
        accountId: string;
        providerCode: string;
    }): Promise<DeletePlatformOAuthIdentityResult> {
        if (this.unlinkResult) return this.unlinkResult;
        const links = this.links.get(input.accountId) ?? [];
        if (!links.some((link) => link.provider_code === input.providerCode)) {
            return { status: 'not-found' };
        }
        this.links.set(
            input.accountId,
            links.filter((link) => link.provider_code !== input.providerCode)
        );
        return { status: 'deleted' };
    }
}

function link(
    accountId: string,
    providerCode: string,
    providerEnabled = true
): PlatformOAuthLinkRecord {
    void accountId;
    return {
        provider_code: providerCode,
        provider_label: providerCode,
        provider_enabled: providerEnabled,
        provider_display_name: '',
        provider_avatar_url: '',
        created_at: 5,
    };
}

function configure() {
    const platformAccounts = new FakePlatformAccounts();
    const csrf = 'platform-users-csrf';
    const tokens = new HmacBackofficeTokenService(
        'admin-platform-users-contract-secret-that-is-long-enough'
    );
    const admin = {
        id: 1,
        username: 'platform-users-admin',
        producername: 'Platform Users Admin',
        password: 'unused',
        dept: 'op' as const,
        admin_role: 'super_admin' as const,
    };
    const runtime = {
        backofficeTokens: tokens,
        backofficeAuth: {
            async findUserById(id: number) {
                if (id === admin.id) return admin;
                if (id === 2) return { ...admin, id: 2, admin_role: 'admin' as const };
                return null;
            },
        },
        platformAccounts,
        audit: {
            async insertAuditLog(input: AuditEntry) {
                platformAccounts.audit.push({
                    action: input.action,
                    target: input.target,
                });
            },
            async listRecentAuditLogs() {
                return [];
            },
        },
        cache: new MemoryCache(),
        platformEmailResendPolicy: {
            async getPolicy() {
                return { resendCooldownSeconds: 60, updatedAt: 0 };
            },
        },
        platformEmailJobPayloadCipher: {
            encrypt(identity: object, payload: { normalizedEmail: string }) {
                return {
                    ...identity,
                    normalizedEmail: payload.normalizedEmail,
                    payloadCiphertext: 'ciphertext',
                };
            },
        },
        platformEmailDeliveryQueue: {
            async enqueuePasswordReset() {
                return {
                    status: 'queued' as const,
                    resendAfter: Date.now() + 60_000,
                    retryAfterSeconds: 60,
                    policyUpdatedAt: 0,
                };
            },
        },
        config: { cookieSecure: false, clientAddressSource: 'direct' },
    } as unknown as RuntimeServices;
    const app = createTestApp(runtime);
    return { app, platformAccounts, csrf, tokens, admin };
}

async function superAdminHeaders(
    tokens: HmacBackofficeTokenService,
    csrf: string
): Promise<Record<string, string>> {
    const token = await tokens.sign(
        {
            id: 1,
            username: 'platform-users-admin',
            dept: 'op',
            adminRole: 'super_admin',
            csrfSecret: csrf,
        },
        7_200
    );
    return {
        Cookie: `${BACKOFFICE_ACCESS_TOKEN_COOKIE}=${token}; ${BACKOFFICE_CSRF_TOKEN_COOKIE}=${csrf}`,
        'X-CSRFToken': csrf,
    };
}

async function operatorHeaders(
    tokens: HmacBackofficeTokenService,
    adminRole: 'admin'
): Promise<Record<string, string>> {
    const token = await tokens.sign(
        {
            id: 2,
            username: 'platform-users-admin',
            dept: 'op',
            adminRole,
            csrfSecret: 'platform-users-csrf',
        },
        7_200
    );
    return { Authorization: `Bearer ${token}` };
}

test('platform-user administration requires a super admin', async () => {
    const { app, tokens, csrf } = configure();
    const unauthorized = await app.request(USERS_URL);
    assert.equal(unauthorized.status, 401);
    await assertRawJsonConforms(unauthorized, adminPlatformUserHttpErrorSchema);

    const nonSuper = await app.request(USERS_URL, {
        headers: await operatorHeaders(tokens, 'admin'),
    });
    assert.equal(nonSuper.status, 403);
    await assertRawJsonConforms(nonSuper, adminPlatformUserHttpErrorSchema);

    const csrfHeaders = await superAdminHeaders(tokens, csrf);
    const { 'X-CSRFToken': _csrf, ...withoutCsrf } = csrfHeaders;
    const missingCsrf = await app.request(`${USERS_URL}/a-1/status`, {
        method: 'PUT',
        headers: { ...withoutCsrf, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'suspended', expectedUpdatedAt: 1 }),
    });
    assert.equal(missingCsrf.status, 403);
});

test('platform-user list paginates and searches by id, email and display name', async () => {
    const { app, platformAccounts, tokens, csrf } = configure();
    platformAccounts.add({ id: 'a-1', display_name: 'Alpha', created_at: 1 });
    platformAccounts.add({
        id: 'a-2',
        display_name: 'Beta',
        normalized_email: 'beta@example.com',
        created_at: 2,
    });
    platformAccounts.add({
        id: 'a-3',
        display_name: 'Gamma',
        normalized_email: 'gamma@example.com',
        created_at: 3,
        status: 'suspended',
    });
    platformAccounts.add({ id: 'a-4', display_name: 'Ghost', deleted_at: 5 });
    const headers = await superAdminHeaders(tokens, csrf);

    const firstPage = await app.request(`${USERS_URL}?page=1&pageSize=2`, { headers });
    assert.equal(firstPage.status, 200);
    const pageOne = await assertRawJsonConforms(firstPage, adminPlatformUserListSchema);
    assert.deepEqual(
        pageOne.users.map((user) => user.id),
        ['a-3', 'a-2']
    );
    assert.deepEqual(pageOne.pageInfo, {
        page: 1,
        pageSize: 2,
        total: 3,
        totalPages: 2,
        hasNextPage: true,
    });

    const secondPage = await app.request(`${USERS_URL}?page=2&pageSize=2`, { headers });
    const pageTwo = await assertRawJsonConforms(secondPage, adminPlatformUserListSchema);
    assert.deepEqual(pageTwo.users.map((user) => user.id), ['a-1']);
    assert.equal(pageTwo.pageInfo.hasNextPage, false);

    for (const [field, query, expected] of [
        ['id', 'a-2', ['a-2']],
        ['email', 'beta@example.com', ['a-2']],
        ['display_name', 'amm', ['a-3']],
    ] as const) {
        const found = await app.request(
            `${USERS_URL}?field=${field}&query=${encodeURIComponent(query)}`,
            { headers }
        );
        const body = await assertRawJsonConforms(found, adminPlatformUserListSchema);
        assert.deepEqual(body.users.map((user) => user.id), expected);
    }

    const empty = await app.request(`${USERS_URL}?field=email&query=none@example.com`, {
        headers,
    });
    const emptyBody = await assertRawJsonConforms(empty, adminPlatformUserListSchema);
    assert.deepEqual(emptyBody.users, []);
    assert.equal(emptyBody.pageInfo.total, 0);

    const serialized = JSON.stringify(pageOne);
    for (const secret of ['token_hash', 'previous_token_hash', 'csrf_hash', 'password_hash']) {
        assert.equal(serialized.includes(secret), false, `${secret} must never be serialized`);
    }
});

test('platform-user detail surfaces OAuth links and 404s for unknown ids', async () => {
    const { app, platformAccounts, tokens, csrf } = configure();
    platformAccounts.add({ id: 'a-1', has_password: false });
    platformAccounts.links.set('a-1', [link('a-1', 'github')]);
    const headers = await superAdminHeaders(tokens, csrf);

    const detail = await app.request(`${USERS_URL}/a-1`, { headers });
    assert.equal(detail.status, 200);
    const body = await assertRawJsonConforms(detail, adminPlatformUserDetailResponseSchema);
    assert.equal(body.user.hasPassword, false);
    assert.equal(body.user.oauthLinks.length, 1);
    assert.equal(body.user.oauthLinks[0]?.provider, 'github');
    // A lone OAuth link is the last way in, so it must not be offered for removal.
    assert.equal(body.user.oauthLinks[0]?.removable, false);

    const missing = await app.request(`${USERS_URL}/nope`, { headers });
    assert.equal(missing.status, 404);
    await assertRawJsonConforms(missing, adminPlatformUserHttpErrorSchema);
});

test('status changes are optimistic-locked and audited', async () => {
    const { app, platformAccounts, tokens, csrf } = configure();
    platformAccounts.add({ id: 'a-1', updated_at: 100 });
    platformAccounts.add({ id: 'a-2', status: 'restricted', updated_at: 100 });
    const headers = await superAdminHeaders(tokens, csrf);

    const suspended = await app.request(`${USERS_URL}/a-1/status`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'suspended', expectedUpdatedAt: 100 }),
    });
    assert.equal(suspended.status, 200, await suspended.clone().text());
    const suspendedBody = await assertRawJsonConforms(
        suspended,
        adminPlatformUserStatusResponseSchema
    );
    assert.equal(suspendedBody.user.status, 'suspended');
    assert.equal(platformAccounts.accounts.get('a-1')?.token_version, 1);
    assert.deepEqual(platformAccounts.sessionSweeps, ['a-1']);

    const stale = await app.request(`${USERS_URL}/a-1/status`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'active', expectedUpdatedAt: 100 }),
    });
    assert.equal(stale.status, 409);
    const staleBody = await assertRawJsonConforms(stale, adminPlatformUserHttpErrorSchema);
    assert.equal('code' in staleBody && staleBody.code, 'REVISION_CONFLICT');

    const idempotent = await app.request(`${USERS_URL}/a-1/status`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
            status: 'suspended',
            expectedUpdatedAt: platformAccounts.accounts.get('a-1')!.updated_at,
        }),
    });
    assert.equal(idempotent.status, 200);

    const auditCount = platformAccounts.audit.length;
    assert.equal(auditCount, 1);
    assert.equal(platformAccounts.audit[0]?.action, '禁用平台用户');
    assert.equal(platformAccounts.audit[0]?.target, 'platform_user=a-1;result=suspended');

    const restricted = await app.request(`${USERS_URL}/a-2/status`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'suspended', expectedUpdatedAt: 100 }),
    });
    assert.equal(restricted.status, 200);

    const unknown = await app.request(`${USERS_URL}/missing/status`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'suspended', expectedUpdatedAt: 1 }),
    });
    assert.equal(unknown.status, 404);

    const invalid = await app.request(`${USERS_URL}/a-1/status`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'suspended', expectedUpdatedAt: 1, extra: true }),
    });
    assert.equal(invalid.status, 400);
});

test('activating a restricted account is refused as unsupported', async () => {
    const { app, platformAccounts, tokens, csrf } = configure();
    platformAccounts.add({ id: 'r-1', status: 'restricted', updated_at: 100 });
    const headers = await superAdminHeaders(tokens, csrf);
    const response = await app.request(`${USERS_URL}/r-1/status`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'active', expectedUpdatedAt: 100 }),
    });
    assert.equal(response.status, 409);
    const body = await assertRawJsonConforms(response, adminPlatformUserHttpErrorSchema);
    assert.equal('code' in body && body.code, 'PLATFORM_USER_STATUS_UNSUPPORTED');
});

test('force logout revokes sessions and is idempotent', async () => {
    const { app, platformAccounts, tokens, csrf } = configure();
    platformAccounts.add({ id: 'a-1' });
    const headers = await superAdminHeaders(tokens, csrf);
    const revoked = await app.request(`${USERS_URL}/a-1/sessions`, {
        method: 'DELETE',
        headers,
    });
    assert.equal(revoked.status, 200, await revoked.clone().text());
    const body = await assertRawJsonConforms(
        revoked,
        adminPlatformUserSessionRevocationResponseSchema
    );
    assert.equal(body.revokedSessionCount, 3);
    assert.equal(platformAccounts.accounts.get('a-1')?.token_version, 1);
    assert.equal(platformAccounts.audit.at(-1)?.action, '强制下线平台用户');

    const again = await app.request(`${USERS_URL}/a-1/sessions`, {
        method: 'DELETE',
        headers,
    });
    assert.equal(again.status, 200);
    await assertRawJsonConforms(again, adminPlatformUserSessionRevocationResponseSchema);

    const missing = await app.request(`${USERS_URL}/missing/sessions`, {
        method: 'DELETE',
        headers,
    });
    assert.equal(missing.status, 404);
});

test('password reset refuses suspended and OAuth-only accounts', async () => {
    const { app, platformAccounts, tokens, csrf } = configure();
    platformAccounts.add({ id: 's-1', status: 'suspended', updated_at: 100 });
    platformAccounts.add({
        id: 'o-1',
        has_password: false,
        normalized_email: null,
    });
    platformAccounts.add({ id: 'a-1' });
    const headers = await superAdminHeaders(tokens, csrf);

    const suspended = await app.request(`${USERS_URL}/s-1/password-reset`, {
        method: 'POST',
        headers,
    });
    assert.equal(suspended.status, 409);
    const suspendedBody = await assertRawJsonConforms(
        suspended,
        adminPlatformUserHttpErrorSchema
    );
    assert.equal('code' in suspendedBody && suspendedBody.code, 'PLATFORM_USER_SUSPENDED');

    const oauthOnly = await app.request(`${USERS_URL}/o-1/password-reset`, {
        method: 'POST',
        headers,
    });
    assert.equal(oauthOnly.status, 409);
    const oauthOnlyBody = await assertRawJsonConforms(
        oauthOnly,
        adminPlatformUserHttpErrorSchema
    );
    assert.equal(
        'code' in oauthOnlyBody && oauthOnlyBody.code,
        'PLATFORM_USER_PASSWORD_RESET_UNAVAILABLE'
    );

    const queued = await app.request(`${USERS_URL}/a-1/password-reset`, {
        method: 'POST',
        headers,
    });
    assert.equal(queued.status, 202, await queued.clone().text());
    const queuedBody = await assertRawJsonConforms(
        queued,
        adminPlatformUserPasswordResetResponseSchema
    );
    assert.equal(queuedBody.queued, true);
    assert.equal(platformAccounts.audit.at(-1)?.action, '触发平台用户密码重置');

    const missing = await app.request(`${USERS_URL}/missing/password-reset`, {
        method: 'POST',
        headers,
    });
    assert.equal(missing.status, 404);
});

test('OAuth unlinking honours the last-credential guard and records the refusal', async () => {
    const { app, platformAccounts, tokens, csrf } = configure();
    platformAccounts.add({ id: 'a-1' });
    const headers = await superAdminHeaders(tokens, csrf);

    platformAccounts.unlinkResult = { status: 'last-login-method' };
    const refused = await app.request(`${USERS_URL}/a-1/oauth-links/github`, {
        method: 'DELETE',
        headers,
    });
    assert.equal(refused.status, 409);
    const refusedBody = await assertRawJsonConforms(
        refused,
        adminPlatformUserHttpErrorSchema
    );
    assert.equal('code' in refusedBody && refusedBody.code, 'PLATFORM_OAUTH_LAST_LOGIN_METHOD');
    assert.equal(
        platformAccounts.audit.at(-1)?.target,
        'platform_user=a-1;result=oauth_unlink_refused_last_credential'
    );

    platformAccounts.unlinkResult = null;
    platformAccounts.links.set('a-1', [link('a-1', 'github')]);
    const removed = await app.request(`${USERS_URL}/a-1/oauth-links/github`, {
        method: 'DELETE',
        headers,
    });
    assert.equal(removed.status, 200, await removed.clone().text());
    const removedBody = await assertRawJsonConforms(
        removed,
        adminPlatformUserOAuthUnlinkResponseSchema
    );
    assert.equal(removedBody.provider, 'github');
    assert.equal(platformAccounts.audit.at(-1)?.action, '解绑平台用户 OAuth');

    const unknownLink = await app.request(`${USERS_URL}/a-1/oauth-links/gitlab`, {
        method: 'DELETE',
        headers,
    });
    assert.equal(unknownLink.status, 404);

    const missingUser = await app.request(`${USERS_URL}/missing/oauth-links/github`, {
        method: 'DELETE',
        headers,
    });
    assert.equal(missingUser.status, 404);
});

test('platform-user request validation stays strict', async () => {
    const { app, tokens, csrf } = configure();
    const headers = await superAdminHeaders(tokens, csrf);
    const unknownQuery = await app.request(`${USERS_URL}?unexpected=1`, { headers });
    assert.equal(unknownQuery.status, 400);

    const malformedBody = await app.request(`${USERS_URL}/a-1/status`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: '{',
    });
    assert.equal(malformedBody.status, 400);

    const notJson = await app.request(TEST_ORIGIN + `${USERS_URL}/a-1/status`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'text/plain' },
        body: 'nope',
    });
    assert.equal(notJson.status, 400);
});

test('list query normalization defaults, clamps and escapes LIKE metacharacters', () => {
    assert.deepEqual(normalizeAdminPlatformUserListQuery({}), {
        field: 'display_name',
        query: null,
        page: 1,
        pageSize: 20,
    });
    assert.deepEqual(
        normalizeAdminPlatformUserListQuery({ query: 'a%b_c\\d' }),
        {
            field: 'display_name',
            // `%`, `_` and `\` become literals for the SQL `ESCAPE '\\'`.
            query: '%a\\%b\\_c\\\\d%',
            page: 1,
            pageSize: 20,
        }
    );
    assert.deepEqual(
        normalizeAdminPlatformUserListQuery({ field: 'email', query: 'A@B.test' }),
        {
            field: 'email',
            query: 'a@b.test',
            page: 1,
            pageSize: 20,
        }
    );
    assert.deepEqual(
        normalizeAdminPlatformUserListQuery({ page: '0', pageSize: '999' }),
        {
            field: 'display_name',
            query: null,
            page: 1,
            pageSize: 50,
        }
    );
    assert.deepEqual(normalizeAdminPlatformUserListQuery({ page: '2', pageSize: '0' }), {
        field: 'display_name',
        query: null,
        page: 2,
        pageSize: 20,
    });
});
