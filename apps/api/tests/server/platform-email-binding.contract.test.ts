import assert from 'node:assert/strict';
import { test } from 'node:test';
import { platformHttpErrorSchema } from '@imsweb/contracts/platform';
import {
    platformEmailBindingResponseSchema,
    platformEmailCredentialResponseSchema,
    platformEmailVerificationCodeResponseSchema
} from '@imsweb/contracts/platform/account-security';
import type { PlatformOAuthProviderSummary } from '@/ports/oauth';
import {
    hashPlatformEmailBindingCode
} from '@/domains/identity/platform-account-security/email/email-binding-code';
import { hashPlatformEmailVerificationCode } from '@/domains/identity/platform-auth/registration/email-verification';
import { readContractJson as assertRawJsonConforms } from '../contracts/contract-json';
import {
    ACCOUNT_ID,
    AccountSecurityFixture,
    CURRENT_PASSWORD,
    GITHUB_PROVIDER,
    bearerHeaders,
    storedDigest
} from '../fixtures/account-security-fixture';

const EMAIL_URL = 'http://ims.test/api/platform/me/email';
const CODE_URL = 'http://ims.test/api/platform/me/email/verification-code';
const BIND_URL = 'http://ims.test/api/platform/me/email/bind';
const CHANGE_URL = 'http://ims.test/api/platform/me/email/change';
const LINK_START_URL = 'http://ims.test/api/platform/me/oauth-links/github/start';

interface ErrorBody {
    code?: string;
    error?: string;
    success?: boolean;
}

async function sendJson(
    fixture: AccountSecurityFixture,
    url: string,
    body: unknown,
    headers: Record<string, string> = bearerHeaders()
): Promise<Response> {
    return await fixture.app.request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body)
    });
}

test('platform email binding raw JSON conforms across read, code, and bind', async () => {
    const fixture = new AccountSecurityFixture({ credential: null });

    const read = await fixture.app.request(EMAIL_URL, { headers: bearerHeaders() });
    assert.equal(read.status, 200);
    await assertRawJsonConforms(read, platformEmailCredentialResponseSchema);

    const code = await sendJson(fixture, CODE_URL, { email: 'bound@example.test' });
    assert.equal(code.status, 202);
    await assertRawJsonConforms(code, platformEmailVerificationCodeResponseSchema);

    const rawCode = fixture.emailedCodes.get('bound@example.test');
    assert.ok(rawCode);
    const bound = await sendJson(fixture, BIND_URL, {
        email: 'bound@example.test',
        code: rawCode,
        newPassword: 'bound-secret-123'
    });
    assert.equal(bound.status, 200);
    await assertRawJsonConforms(bound, platformEmailBindingResponseSchema);

    const anonymous = await fixture.app.request(EMAIL_URL);
    assert.equal(anonymous.status, 401);
    await assertRawJsonConforms(anonymous, platformHttpErrorSchema);
});

test('email binding rejects anonymous callers on every route', async () => {
    const fixture = new AccountSecurityFixture({ credential: null });
    const unauthenticated = [
        await fixture.app.request(CODE_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: 'anon@example.test' })
        }),
        await fixture.app.request(BIND_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                email: 'anon@example.test',
                code: '012345',
                newPassword: 'bound-secret-123'
            })
        }),
        await fixture.app.request(CHANGE_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                email: 'next@example.test',
                code: '012345',
                currentPassword: CURRENT_PASSWORD
            })
        })
    ];
    for (const response of unauthenticated) {
        assert.equal(response.status, 401);
    }
    assert.equal(fixture.emailedCodes.size, 0);
});

test('the verification code is hashed with the binding domain, not the registration one', async () => {
    const fixture = new AccountSecurityFixture({ credential: null });
    const email = 'domain@example.test';

    const response = await sendJson(fixture, CODE_URL, { email });
    assert.equal(response.status, 202);

    const code = fixture.emailedCodes.get(email);
    assert.ok(code);
    const stored = fixture.verificationCodes.get(email);
    assert.ok(stored);
    assert.equal(stored.codeHash, hashPlatformEmailBindingCode(email, code));
    // The two code spaces must not collide on the shared table.
    assert.notEqual(
        hashPlatformEmailBindingCode(email, code),
        hashPlatformEmailVerificationCode(email, code)
    );
});

test('binding requires a valid code and leaves no credential on failure', async () => {
    const fixture = new AccountSecurityFixture({ credential: null });
    const email = 'invalid@example.test';
    fixture.issueEmailBindingCode(email, '123456');

    const failed = await sendJson(fixture, BIND_URL, {
        email,
        code: '000000',
        newPassword: 'bound-secret-123'
    });
    assert.equal(failed.status, 400);
    assert.equal(
        ((await failed.json()) as ErrorBody).code,
        'PLATFORM_EMAIL_VERIFICATION_INVALID'
    );
    assert.equal(
        await fixture.platformAccounts.findEmailCredentialByAccountId(ACCOUNT_ID),
        null
    );
    // A failed attempt must not spend the code.
    assert.equal(fixture.verificationCodes.get(email)?.consumedToken, null);

    const bound = await sendJson(fixture, BIND_URL, {
        email,
        code: '123456',
        newPassword: 'bound-secret-123'
    });
    assert.equal(bound.status, 200);
    const credential = await fixture.platformAccounts.findEmailCredentialByAccountId(
        ACCOUNT_ID
    );
    assert.ok(credential);
    assert.equal(credential.normalized_email, email);
    assert.equal(credential.password_hash, storedDigest('bound-secret-123'));
});

test('binding a second email for an account already bound is refused', async () => {
    const fixture = new AccountSecurityFixture();
    fixture.issueEmailBindingCode('second@example.test', '123456');

    const response = await sendJson(fixture, BIND_URL, {
        email: 'second@example.test',
        code: '123456',
        newPassword: 'bound-secret-123'
    });
    assert.equal(response.status, 409);
    assert.equal(
        ((await response.json()) as ErrorBody).code,
        'PLATFORM_EMAIL_ALREADY_BOUND'
    );
    assert.equal(fixture.credential?.normalized_email, 'owner@example.test');
});

test('sending a code for an address owned by another account is refused up front', async () => {
    const fixture = new AccountSecurityFixture({
        credential: null,
        foreignEmails: ['taken@example.test']
    });

    const response = await sendJson(fixture, CODE_URL, { email: 'taken@example.test' });
    assert.equal(response.status, 409);
    assert.equal(((await response.json()) as ErrorBody).code, 'PLATFORM_EMAIL_CONFLICT');
    // No mail is queued for an address the caller cannot claim.
    assert.equal(fixture.emailEnqueues.length, 0);
});

test('changing an email needs the current password and keeps the credential on refusal', async () => {
    const fixture = new AccountSecurityFixture();
    const before = await fixture.platformAccounts.findEmailCredentialByAccountId(
        ACCOUNT_ID
    );
    assert.ok(before);
    fixture.issueEmailBindingCode('next@example.test', '123456');

    const refused = await sendJson(fixture, CHANGE_URL, {
        email: 'next@example.test',
        code: '123456',
        currentPassword: 'not-the-current-password'
    });
    assert.equal(refused.status, 403);
    assert.equal(
        ((await refused.json()) as ErrorBody).code,
        'PLATFORM_PASSWORD_CURRENT_INVALID'
    );
    assert.deepEqual(
        await fixture.platformAccounts.findEmailCredentialByAccountId(ACCOUNT_ID),
        before
    );
    // The code was not spent by a refusal that never reached the repository.
    assert.equal(fixture.verificationCodes.get('next@example.test')?.consumedToken, null);
});

test('changing an email preserves the password hash and every live session', async () => {
    const fixture = new AccountSecurityFixture();
    const before = await fixture.platformAccounts.findEmailCredentialByAccountId(
        ACCOUNT_ID
    );
    assert.ok(before);
    const sessionsBefore = fixture.liveSessionIds();
    fixture.issueEmailBindingCode('moved@example.test', '123456');

    const response = await sendJson(fixture, CHANGE_URL, {
        email: 'moved@example.test',
        code: '123456',
        currentPassword: CURRENT_PASSWORD
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        success: true,
        email: 'moved@example.test'
    });

    const after = await fixture.platformAccounts.findEmailCredentialByAccountId(
        ACCOUNT_ID
    );
    assert.ok(after);
    assert.equal(after.normalized_email, 'moved@example.test');
    // AC2a: the old password still signs in, with no reset step.
    assert.equal(after.password_hash, before.password_hash);
    assert.equal(after.algorithm, before.algorithm);
    assert.equal(after.salt, before.salt);
    assert.equal(after.created_at, before.created_at);
    assert.equal(
        await fixture.passwords.verify(CURRENT_PASSWORD, after.password_hash),
        true
    );
    // AC2a: sessions established before the migration are untouched.
    assert.deepEqual(fixture.liveSessionIds(), sessionsBefore);
});

test('changing to an address owned by another account is refused without a partial write', async () => {
    const fixture = new AccountSecurityFixture({
        foreignEmails: ['taken@example.test']
    });
    const before = await fixture.platformAccounts.findEmailCredentialByAccountId(
        ACCOUNT_ID
    );

    const response = await sendJson(fixture, CHANGE_URL, {
        email: 'taken@example.test',
        code: '123456',
        currentPassword: CURRENT_PASSWORD
    });
    assert.equal(response.status, 409);
    assert.equal(((await response.json()) as ErrorBody).code, 'PLATFORM_EMAIL_CONFLICT');
    assert.deepEqual(
        await fixture.platformAccounts.findEmailCredentialByAccountId(ACCOUNT_ID),
        before
    );
});

test('changing an email on a provider-only account reports not-bound', async () => {
    const fixture = new AccountSecurityFixture({ credential: null });

    const response = await sendJson(fixture, CHANGE_URL, {
        email: 'next@example.test',
        code: '123456',
        currentPassword: CURRENT_PASSWORD
    });
    assert.equal(response.status, 409);
    assert.equal(((await response.json()) as ErrorBody).code, 'PLATFORM_EMAIL_NOT_BOUND');
});

test('email binding and OAuth link start use their own account-dimension buckets', async () => {
    const fixture = new AccountSecurityFixture();
    fixture.rateLimiter.deniedBuckets.add('platform-security-email-account');

    const limited = await sendJson(fixture, CODE_URL, { email: 'rate@example.test' });
    assert.equal(limited.status, 429);
    assert.equal(((await limited.json()) as ErrorBody).code, 'PLATFORM_RATE_LIMITED');
    assert.ok(
        fixture.rateLimiter.calls.some(
            (call) => call.bucket === 'platform-security-email-account'
        )
    );
});

test('OAuth link start writes an intent=link state and redirects to the provider', async () => {
    const fixture = new AccountSecurityFixture({
        credential: null,
        oauthProviders: [
            {
                code: GITHUB_PROVIDER,
                displayName: 'GitHub',
                icon: 'github',
                buttonColor: '#24292f'
            } as PlatformOAuthProviderSummary
        ]
    });

    const response = await fixture.app.request(LINK_START_URL, {
        headers: bearerHeaders(),
        redirect: 'manual'
    });
    assert.equal(response.status, 303);
    assert.equal(
        response.headers.get('location'),
        'https://github.example.test/authorize'
    );
    assert.equal(fixture.oauthStateInputs.length, 1);
    const state = fixture.oauthStateInputs[0]!;
    assert.equal(state.intent, 'link');
    assert.equal(state.linkingAccountId, ACCOUNT_ID);
    assert.equal(state.returnPath, '/account/security');
    assert.equal(state.clientTarget, 'web');
    assert.equal(state.appCodeChallenge, null);
});

test('an unavailable provider returns to account security with a reason', async () => {
    const fixture = new AccountSecurityFixture({ credential: null });

    const response = await fixture.app.request(
        'http://ims.test/api/platform/me/oauth-links/legacy-sso/start',
        { headers: bearerHeaders(), redirect: 'manual' }
    );
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.pathname, '/account/security');
    assert.equal(location.searchParams.get('oauth'), 'link-unavailable');
    assert.equal(fixture.oauthStateInputs.length, 0);
});

test('a provider that cannot build an authorization URL writes no state', async () => {
    const fixture = new AccountSecurityFixture({
        credential: null,
        oauthProviders: [
            {
                code: GITHUB_PROVIDER,
                displayName: 'GitHub',
                icon: 'github',
                buttonColor: '#24292f'
            } as PlatformOAuthProviderSummary
        ]
    });
    fixture.oauthAuthorizationUrl = null;

    const response = await fixture.app.request(LINK_START_URL, {
        headers: bearerHeaders(),
        redirect: 'manual'
    });
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location')!);
    assert.equal(location.searchParams.get('oauth'), 'link-unavailable');
    assert.equal(fixture.oauthStateInputs.length, 0);
});

test('OAuth link start demands a session', async () => {
    const fixture = new AccountSecurityFixture({ credential: null });

    const response = await fixture.app.request(LINK_START_URL, {
        redirect: 'manual'
    });
    assert.equal(response.status, 401);
});
