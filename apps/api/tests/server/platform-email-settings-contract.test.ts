import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
    adminPlatformEmailConfigurationTestRequestSchema,
    adminPlatformEmailConfigurationWriteRequestSchema,
    adminPlatformEmailHttpErrorSchema,
    adminPlatformEmailMutationResponseSchema,
    adminPlatformEmailSettingsResponseSchema,
    adminPlatformEmailSettingsSchema,
    adminPlatformEmailTestResponseSchema,
} from '@imsweb/contracts/platform/admin-email';
import { adminApiPath } from '@imsweb/contracts/paths';
import {
    BACKOFFICE_ACCESS_TOKEN_COOKIE,
    BACKOFFICE_CSRF_TOKEN_COOKIE,
} from '@/domains/admin/backoffice-auth/backoffice-auth-session';
import type { RuntimeServices } from '@/ports/runtime-services';
import { readContractJson as assertRawJsonConforms } from '../contracts/contract-json';
import { createWikiFixture } from '../wiki/fixture';

const ADMIN_EMAIL_URL = adminApiPath('/platform/email');

const settings = {
    enabled: false,
    configured: true,
    host: 'smtp.qiye.163.com',
    port: 465,
    security: 'tls' as const,
    usernameMasked: 'ma***@texasoct.tech',
    passwordConfigured: true,
    fromAddress: 'mail@texasoct.tech',
    fromName: 'IMSWeb',
    resendCooldownSeconds: 60,
    updatedAt: 1_000,
};

const writeRequest = {
    enabled: true,
    host: settings.host,
    port: settings.port,
    security: settings.security,
    username: 'mail@texasoct.tech',
    password: 'smtp-password',
    fromAddress: settings.fromAddress,
    fromName: settings.fromName,
    resendCooldownSeconds: 30,
    expectedUpdatedAt: settings.updatedAt,
};

async function superAdminHeaders(
    fixture: ReturnType<typeof createWikiFixture>,
): Promise<Record<string, string>> {
    const csrf = 'email-settings-csrf';
    const token = await fixture.services.backofficeTokens!.sign(
        {
            id: 1,
            username: 'email-settings-super-admin',
            dept: 'op',
            adminRole: 'super_admin',
            csrfSecret: csrf,
        },
        7_200,
    );
    return {
        Cookie: `${BACKOFFICE_ACCESS_TOKEN_COOKIE}=${token}; ${BACKOFFICE_CSRF_TOKEN_COOKIE}=${csrf}`,
        'X-CSRFToken': csrf,
    };
}

function configureFixture() {
    const fixture = createWikiFixture();
    const writes: unknown[] = [];
    const tests: unknown[] = [];
    let conflict = false;
    fixture.services.backofficeAuth = {
        async findUserById(id: number) {
            return id === 1
                ? {
                      id,
                      username: 'email-settings-super-admin',
                      password: 'unused-password-hash',
                      producername: 'Email Settings Super Admin',
                      dept: 'op',
                      admin_role: 'super_admin' as const,
                  }
                : null;
        },
    } as NonNullable<RuntimeServices['backofficeAuth']>;
    fixture.services.platformEmailConfiguration = {
        async getSettings() {
            return settings;
        },
        async updateSettings(input) {
            writes.push(input);
            return conflict
                ? { status: 'conflict' as const, settings }
                : {
                      status: 'saved' as const,
                      settings: {
                          ...settings,
                          enabled: true,
                          resendCooldownSeconds: input.resendCooldownSeconds,
                      },
                  };
        },
        async sendTest(input) {
            tests.push(input);
            return { status: 'sent' as const, recipient: input.recipient };
        },
    };
    return {
        fixture,
        writes,
        tests,
        setConflict(value: boolean) {
            conflict = value;
        },
    };
}

test('SMTP administration contracts enforce resend cooldown bounds', () => {
    for (const resendCooldownSeconds of [30, 600]) {
        assert.doesNotThrow(() =>
            adminPlatformEmailConfigurationWriteRequestSchema.parse({
                ...writeRequest,
                resendCooldownSeconds,
            }),
        );
        assert.doesNotThrow(() =>
            adminPlatformEmailConfigurationTestRequestSchema.parse({
                ...writeRequest,
                resendCooldownSeconds,
                recipient: 'admin@example.com',
            }),
        );
        assert.doesNotThrow(() =>
            adminPlatformEmailSettingsSchema.parse({
                ...settings,
                resendCooldownSeconds,
            }),
        );
    }

    for (const resendCooldownSeconds of [29, 30.5, 601]) {
        assert.throws(() =>
            adminPlatformEmailConfigurationWriteRequestSchema.parse({
                ...writeRequest,
                resendCooldownSeconds,
            }),
        );
        assert.throws(() =>
            adminPlatformEmailConfigurationTestRequestSchema.parse({
                ...writeRequest,
                resendCooldownSeconds,
                recipient: 'admin@example.com',
            }),
        );
        assert.throws(() =>
            adminPlatformEmailSettingsSchema.parse({
                ...settings,
                resendCooldownSeconds,
            }),
        );
    }
});

test('mounted SMTP administration enforces super-admin auth and exact contracts', async () => {
    const { fixture, writes, tests } = configureFixture();
    const url = ADMIN_EMAIL_URL;

    const unauthorized = await fixture.app.request(url);
    assert.equal(unauthorized.status, 401);
    await assertRawJsonConforms(unauthorized, adminPlatformEmailHttpErrorSchema);

    const headers = await superAdminHeaders(fixture);
    const listed = await fixture.app.request(url, { headers });
    assert.equal(listed.status, 200, await listed.clone().text());
    const listedBody = await assertRawJsonConforms(
        listed,
        adminPlatformEmailSettingsResponseSchema,
    );
    assert.equal('password' in listedBody.settings, false);
    assert.equal('username' in listedBody.settings, false);

    const parsedWrite = adminPlatformEmailConfigurationWriteRequestSchema.parse(writeRequest);
    const saved = await fixture.app.request(url, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(parsedWrite),
    });
    assert.equal(saved.status, 200, await saved.clone().text());
    await assertRawJsonConforms(saved, adminPlatformEmailMutationResponseSchema);
    assert.deepEqual(writes, [parsedWrite]);

    const testRequest = adminPlatformEmailConfigurationTestRequestSchema.parse({
        ...writeRequest,
        recipient: 'admin@example.com',
    });
    const tested = await fixture.app.request(`${ADMIN_EMAIL_URL}/test`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(testRequest),
    });
    assert.equal(tested.status, 200, await tested.clone().text());
    await assertRawJsonConforms(tested, adminPlatformEmailTestResponseSchema);
    assert.deepEqual(tests, [testRequest]);
});

test('SMTP administration returns contract-checked conflicts and strict request errors', async () => {
    const { fixture, setConflict } = configureFixture();
    const headers = await superAdminHeaders(fixture);
    setConflict(true);

    const conflict = await fixture.app.request(ADMIN_EMAIL_URL, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(writeRequest),
    });
    assert.equal(conflict.status, 409, await conflict.clone().text());
    await assertRawJsonConforms(conflict, adminPlatformEmailHttpErrorSchema);

    const invalid = await fixture.app.request(ADMIN_EMAIL_URL, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ ...writeRequest, legacyMode: 'cloudflare' }),
    });
    assert.equal(invalid.status, 400, await invalid.clone().text());
    await assertRawJsonConforms(invalid, adminPlatformEmailHttpErrorSchema);

    const oversizedPassword = await fixture.app.request(ADMIN_EMAIL_URL, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ ...writeRequest, password: '密'.repeat(1_500) }),
    });
    assert.equal(oversizedPassword.status, 400, await oversizedPassword.clone().text());
    await assertRawJsonConforms(
        oversizedPassword,
        adminPlatformEmailHttpErrorSchema,
    );
});
