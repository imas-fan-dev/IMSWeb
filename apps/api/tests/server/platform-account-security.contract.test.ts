import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    platformOAuthLinkListResponseSchema,
    platformOAuthUnlinkResponseSchema,
    platformPasswordChangeResponseSchema,
    platformSessionListResponseSchema,
    platformSessionRevocationResponseSchema
} from '@imsweb/contracts/platform/account-security';
import {
    ACCOUNT_ID,
    AccountSecurityFixture,
    CURRENT_PASSWORD,
    CURRENT_SESSION_ID,
    DISABLED_PROVIDER,
    EXPIRED_SESSION_ID,
    FOREIGN_ACCOUNT_ID,
    FOREIGN_PROVIDER,
    FOREIGN_SESSION_ID,
    GITHUB_PROVIDER,
    GOOGLE_PROVIDER,
    NEXT_PASSWORD,
    REVOKED_SESSION_ID,
    SECOND_DEVICE_SESSION_ID,
    THIRD_DEVICE_SESSION_ID,
    bearerHeaders,
    cookieHeaders,
    oauthLink,
    passwordBody,
    storedDigest
} from '../fixtures/account-security-fixture';

const PASSWORD_URL = 'http://ims.test/api/platform/me/password';
const SESSIONS_URL = 'http://ims.test/api/platform/me/sessions';
const OAUTH_LINKS_URL = 'http://ims.test/api/platform/me/oauth-links';

// The two shapes the unlink guard has to tell apart. Both accounts are
// password-less, so the OAuth links are the only thing keeping them reachable.
const TWO_ENABLED_LINKS = [
    oauthLink(GOOGLE_PROVIDER),
    oauthLink(GITHUB_PROVIDER, { created_at: 4_000 })
];
const ONE_ENABLED_ONE_DISABLED = [
    oauthLink(GOOGLE_PROVIDER),
    oauthLink(DISABLED_PROVIDER, { created_at: 4_000, provider_enabled: false })
];

interface ErrorBody {
    code?: string;
    error?: string;
    success?: boolean;
}

async function changePassword(
    fixture: AccountSecurityFixture,
    body: string,
    headers: Record<string, string> = bearerHeaders()
): Promise<Response> {
    return await fixture.app.request(PASSWORD_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body
    });
}

async function listSessions(fixture: AccountSecurityFixture): Promise<Response> {
    return await fixture.app.request(SESSIONS_URL, { headers: bearerHeaders() });
}

async function listOAuthLinks(
    fixture: AccountSecurityFixture
): Promise<Response> {
    return await fixture.app.request(OAUTH_LINKS_URL, {
        headers: bearerHeaders()
    });
}

async function unlink(
    fixture: AccountSecurityFixture,
    provider: string,
    headers: Record<string, string> = bearerHeaders()
): Promise<Response> {
    return await fixture.app.request(`${OAUTH_LINKS_URL}/${provider}`, {
        method: 'DELETE',
        headers
    });
}

test('platform account security rejects anonymous callers', async () => {
    const fixture = new AccountSecurityFixture();
    const unauthenticated = [
        await fixture.app.request(PASSWORD_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: passwordBody()
        }),
        await fixture.app.request(SESSIONS_URL),
        await fixture.app.request(SESSIONS_URL, { method: 'DELETE' }),
        await fixture.app.request(`${SESSIONS_URL}/${SECOND_DEVICE_SESSION_ID}`, {
            method: 'DELETE'
        })
    ];
    for (const response of unauthenticated) {
        assert.equal(response.status, 401);
        assert.equal(
            ((await response.json()) as ErrorBody).code,
            'PLATFORM_SESSION_INVALID'
        );
    }
    // Nothing was touched on the way to the 401.
    assert.deepEqual(fixture.liveSessionIds(), [
        CURRENT_SESSION_ID,
        SECOND_DEVICE_SESSION_ID,
        THIRD_DEVICE_SESSION_ID
    ].sort());
});

test('a wrong current password is refused without disturbing the account', async () => {
    const fixture = new AccountSecurityFixture();
    const response = await changePassword(
        fixture,
        passwordBody({ currentPassword: 'not-the-password' })
    );

    // 403 rather than 401: the session is intact and only the re-authentication
    // proof failed. The Web client answers every 401 with a refresh-and-retry
    // wave, which would spend the refresh token over a typo.
    assert.equal(response.status, 403);
    assert.equal(
        ((await response.json()) as ErrorBody).code,
        'PLATFORM_PASSWORD_CURRENT_INVALID'
    );
    assert.equal(fixture.credential?.password_hash, storedDigest(CURRENT_PASSWORD));
    assert.equal(fixture.tokenVersion, 0);
    assert.deepEqual(fixture.liveSessionIds(), [
        CURRENT_SESSION_ID,
        SECOND_DEVICE_SESSION_ID,
        THIRD_DEVICE_SESSION_ID
    ].sort());
    assert.deepEqual(fixture.passwordInputs, []);
});

const invalidSubmissions: Array<{ body: string; label: string }> = [
    { label: 'new password under 8 characters', body: passwordBody({ newPassword: 'short12' }) },
    {
        label: 'new password over 128 characters',
        body: passwordBody({ newPassword: 'a'.repeat(129) })
    },
    {
        // bcrypt silently truncates past 72 bytes, so the rule is a byte budget
        // rather than a character count.
        label: 'new password over 72 UTF-8 bytes',
        body: passwordBody({ newPassword: '密'.repeat(25) })
    },
    { label: 'non-string new password', body: passwordBody({ newPassword: 42 }) },
    { label: 'null new password', body: passwordBody({ newPassword: null }) },
    { label: 'blank current password', body: passwordBody({ currentPassword: '   ' }) },
    { label: 'missing current password', body: JSON.stringify({ newPassword: NEXT_PASSWORD }) },
    { label: 'missing new password', body: JSON.stringify({ currentPassword: CURRENT_PASSWORD }) },
    { label: 'unknown field', body: passwordBody({ confirmPassword: NEXT_PASSWORD }) },
    { label: 'array body', body: '[]' },
    { label: 'null body', body: 'null' },
    { label: 'malformed JSON', body: '{"currentPassword":' }
];

for (const submission of invalidSubmissions) {
    test(`password change rejects ${submission.label}`, async () => {
        const fixture = new AccountSecurityFixture();
        const response = await changePassword(fixture, submission.body);

        assert.equal(response.status, 400);
        assert.equal(
            ((await response.json()) as ErrorBody).code,
            'PLATFORM_PASSWORD_INPUT_INVALID'
        );
        assert.equal(fixture.tokenVersion, 0);
        assert.deepEqual(fixture.passwordInputs, []);
    });
}

test('password change refuses to reuse the current password', async () => {
    const fixture = new AccountSecurityFixture();
    const response = await changePassword(
        fixture,
        passwordBody({ newPassword: CURRENT_PASSWORD })
    );

    // A no-op that still bumps token_version and drops every other device is
    // more damage than the request asked for.
    assert.equal(response.status, 400);
    assert.equal(
        ((await response.json()) as ErrorBody).code,
        'PLATFORM_PASSWORD_UNCHANGED'
    );
    assert.equal(fixture.tokenVersion, 0);
    assert.deepEqual(fixture.liveSessionIds().length, 3);
});

test('password change requires a JSON content type', async () => {
    const fixture = new AccountSecurityFixture();
    const response = await changePassword(fixture, passwordBody(), {
        ...bearerHeaders(),
        'content-type': 'text/plain'
    });

    assert.equal(response.status, 415);
    assert.equal(
        ((await response.json()) as ErrorBody).code,
        'PLATFORM_AUTH_JSON_REQUIRED'
    );
});

test('a successful password change keeps this session and drops the others', async () => {
    const fixture = new AccountSecurityFixture();
    const response = await changePassword(fixture, passwordBody());

    assert.equal(response.status, 200);
    const body = platformPasswordChangeResponseSchema.parse(await response.json());
    // Two live siblings, not three: the already-expired row is left alone so
    // this count matches the device list the user was just looking at.
    assert.equal(body.revokedSessionCount, 2);
    // Cookie callers read the rotated tokens from Set-Cookie, so the body must
    // not carry them.
    assert.equal(body.accessToken, undefined);
    assert.equal(body.refreshToken, undefined);

    assert.equal(fixture.credential?.password_hash, storedDigest(NEXT_PASSWORD));
    // token_version moves so every access token minted before now is dead.
    assert.equal(fixture.tokenVersion, 1);
    // The replacement access token was minted for the new version, which is what
    // lets the caller stay signed in.
    assert.equal(fixture.signedTokenVersions.includes(1), true);
    // The kept session was re-armed with a fresh refresh token hash.
    const kept = fixture.sessions.get(CURRENT_SESSION_ID)!;
    assert.equal(kept.revoked_at, null);
    assert.notEqual(kept.token_hash, `token-hash-${CURRENT_SESSION_ID}`);
    assert.equal(kept.previous_token_hash, null);

    assert.deepEqual(fixture.liveSessionIds(), [CURRENT_SESSION_ID]);
    for (const id of [SECOND_DEVICE_SESSION_ID, THIRD_DEVICE_SESSION_ID]) {
        assert.notEqual(fixture.sessions.get(id)!.revoked_at, null);
    }
    // An expired refresh token cannot be redeemed, so revoking it would buy
    // nothing and only inflate the number reported to the user.
    assert.equal(fixture.sessions.get(EXPIRED_SESSION_ID)!.revoked_at, null);
    // A different account's session is none of this account's business.
    assert.equal(fixture.sessions.get(FOREIGN_SESSION_ID)!.revoked_at, null);

    // The current session is still usable after the change.
    const followUp = await listSessions(fixture);
    assert.equal(followUp.status, 200);
    assert.deepEqual(
        platformSessionListResponseSchema.parse(await followUp.json())
            .sessions.map((entry) => entry.id),
        [CURRENT_SESSION_ID]
    );
});

test('packaged clients receive the rotated tokens in the body', async () => {
    const fixture = new AccountSecurityFixture();
    const response = await changePassword(fixture, passwordBody(), {
        ...bearerHeaders(),
        'x-ims-auth-mode': 'bearer'
    });

    assert.equal(response.status, 200);
    const body = platformPasswordChangeResponseSchema.parse(await response.json());
    // A packaged client has no cookie jar, so Set-Cookie alone would strand it.
    assert.equal(typeof body.accessToken, 'string');
    assert.equal(typeof body.refreshToken, 'string');
    assert.match(body.refreshToken!, /^v1\.1\./);
});

test('an account without an email credential cannot change a password', async () => {
    const fixture = new AccountSecurityFixture({ credential: null });
    const response = await changePassword(fixture, passwordBody());

    assert.equal(response.status, 409);
    assert.equal(
        ((await response.json()) as ErrorBody).code,
        'PLATFORM_PASSWORD_UNAVAILABLE'
    );
});

test('the session list never exposes a session secret', async () => {
    const fixture = new AccountSecurityFixture();
    const response = await listSessions(fixture);

    assert.equal(response.status, 200);
    const raw = await response.text();
    // The three hash columns are session-bearer credentials. Assert against the
    // raw payload so a leak cannot hide behind a renamed field.
    for (const secret of ['token_hash', 'csrf_hash', 'previous_token_hash',
        'tokenHash', 'csrfHash', 'previousTokenHash']) {
        assert.equal(raw.includes(secret), false, `${secret} leaked`);
    }
    const current = fixture.sessions.get(CURRENT_SESSION_ID)!;
    for (const value of [current.token_hash, current.csrf_hash]) {
        assert.equal(raw.includes(value), false, 'a hash value leaked');
    }

    // The contract schema is strict, so any extra field fails here too.
    const body = platformSessionListResponseSchema.parse(JSON.parse(raw));
    assert.deepEqual(
        body.sessions.map((entry) => entry.id).sort(),
        [CURRENT_SESSION_ID, SECOND_DEVICE_SESSION_ID, THIRD_DEVICE_SESSION_ID].sort()
    );
    // Revoked and expired rows are not devices the owner can still act on.
    for (const id of [REVOKED_SESSION_ID, EXPIRED_SESSION_ID, FOREIGN_SESSION_ID]) {
        assert.equal(body.sessions.some((entry) => entry.id === id), false);
    }
    assert.deepEqual(
        body.sessions.filter((entry) => entry.current).map((entry) => entry.id),
        [CURRENT_SESSION_ID]
    );
    const listed = body.sessions.find((entry) => entry.id === SECOND_DEVICE_SESSION_ID)!;
    assert.equal(listed.userAgent, `agent/${SECOND_DEVICE_SESSION_ID}`);
    assert.equal(listed.ipAddress, '203.0.113.7');
});

test('revoking one session only reaches this account', async () => {
    const fixture = new AccountSecurityFixture();
    const response = await fixture.app.request(
        `${SESSIONS_URL}/${SECOND_DEVICE_SESSION_ID}`,
        { method: 'DELETE', headers: bearerHeaders() }
    );

    assert.equal(response.status, 200);
    assert.deepEqual(
        platformSessionRevocationResponseSchema.parse(await response.json()),
        { success: true, revokedSessionCount: 1 }
    );
    assert.deepEqual(fixture.liveSessionIds(), [
        CURRENT_SESSION_ID,
        THIRD_DEVICE_SESSION_ID
    ].sort());
});

test('a session owned by another account cannot be revoked', async () => {
    const fixture = new AccountSecurityFixture();
    const foreign = await fixture.app.request(
        `${SESSIONS_URL}/${FOREIGN_SESSION_ID}`,
        { method: 'DELETE', headers: bearerHeaders() }
    );

    // Reported exactly like an unknown id: distinguishing the two would turn the
    // endpoint into an oracle for probing live session ids.
    assert.equal(foreign.status, 404);
    assert.equal(
        ((await foreign.json()) as ErrorBody).code,
        'PLATFORM_SESSION_NOT_FOUND'
    );
    assert.equal(fixture.sessions.get(FOREIGN_SESSION_ID)!.revoked_at, null);
    assert.deepEqual(fixture.liveSessionIds(FOREIGN_ACCOUNT_ID), [FOREIGN_SESSION_ID]);

    for (const id of ['missing-session', REVOKED_SESSION_ID, '']) {
        const response = await fixture.app.request(`${SESSIONS_URL}/${id}`, {
            method: 'DELETE',
            headers: bearerHeaders()
        });
        assert.equal(response.status === 404 || response.status === 200, true);
        if (response.status === 200) {
            // The empty segment falls through to the collection route, which is
            // the "sign out everywhere else" action.
            assert.equal(id, '');
        }
    }
});

test('signing out everywhere else keeps the calling session', async () => {
    const fixture = new AccountSecurityFixture();
    const response = await fixture.app.request(SESSIONS_URL, {
        method: 'DELETE',
        headers: bearerHeaders()
    });

    assert.equal(response.status, 200);
    const body = platformSessionRevocationResponseSchema.parse(await response.json());
    // Live siblings only, matching what GET /me/sessions reports.
    assert.equal(body.revokedSessionCount, 2);
    assert.deepEqual(fixture.liveSessionIds(), [CURRENT_SESSION_ID]);
    assert.equal(fixture.sessions.get(FOREIGN_SESSION_ID)!.revoked_at, null);
    assert.equal(fixture.sessions.get(EXPIRED_SESSION_ID)!.revoked_at, null);
    // No credential was touched: this is not a password change.
    assert.equal(fixture.tokenVersion, 0);
    assert.equal(fixture.credential?.password_hash, storedDigest(CURRENT_PASSWORD));
});

test('a restricted account cannot write, but can still read its devices', async () => {
    const fixture = new AccountSecurityFixture({ accountStatus: 'restricted' });
    const writes = [
        await changePassword(fixture, passwordBody()),
        await fixture.app.request(SESSIONS_URL, {
            method: 'DELETE',
            headers: bearerHeaders()
        }),
        await fixture.app.request(`${SESSIONS_URL}/${SECOND_DEVICE_SESSION_ID}`, {
            method: 'DELETE',
            headers: bearerHeaders()
        })
    ];
    for (const response of writes) {
        assert.equal(response.status, 403);
        assert.equal(
            ((await response.json()) as ErrorBody).code,
            'PLATFORM_ACCOUNT_RESTRICTED'
        );
    }
    assert.equal(fixture.tokenVersion, 0);
    assert.deepEqual(fixture.liveSessionIds().length, 3);

    // Seeing where you are signed in is how you work out why you were
    // restricted, so the read stays open.
    const listed = await listSessions(fixture);
    assert.equal(listed.status, 200);
    assert.equal(
        platformSessionListResponseSchema.parse(await listed.json()).sessions.length,
        3
    );
});

test('cookie callers must present a matching CSRF token', async () => {
    const fixture = new AccountSecurityFixture();
    const accepted = await changePassword(fixture, passwordBody(), cookieHeaders());
    assert.equal(accepted.status, 200);

    const replay = new AccountSecurityFixture();
    const rejected = await changePassword(
        replay,
        passwordBody(),
        cookieHeaders({ 'x-csrftoken': 'wrong-secret' })
    );
    assert.equal(rejected.status, 403);
    assert.equal(
        ((await rejected.json()) as ErrorBody).code,
        'PLATFORM_CSRF_INVALID'
    );
    assert.equal(replay.tokenVersion, 0);
});

test('the OAuth link list never exposes the third-party subject', async () => {
    const fixture = new AccountSecurityFixture({
        oauthLinks: ONE_ENABLED_ONE_DISABLED
    });
    const response = await listOAuthLinks(fixture);

    assert.equal(response.status, 200);
    const raw = await response.text();
    // provider_subject is the user's internal id at the third party. Assert
    // against the raw payload so a leak cannot hide behind a renamed field.
    for (const key of ['provider_subject', 'providerSubject', 'subject']) {
        assert.equal(raw.includes(key), false, `${key} leaked`);
    }
    // And the values themselves, so a projection that kept the data under an
    // innocent-looking name is caught too.
    for (const link of fixture.oauthLinks) {
        assert.equal(
            raw.includes(link.provider_subject),
            false,
            'a provider subject value leaked'
        );
    }

    // The contract schema is strict, so any extra field fails here as well.
    const body = platformOAuthLinkListResponseSchema.parse(JSON.parse(raw));
    assert.deepEqual(
        body.links.map((entry) => entry.provider),
        [GOOGLE_PROVIDER, DISABLED_PROVIDER]
    );
    // Another account's link is none of this account's business.
    assert.equal(
        body.links.some((entry) => entry.provider === FOREIGN_PROVIDER),
        false
    );

    const google = body.links.find((e) => e.provider === GOOGLE_PROVIDER)!;
    assert.equal(google.providerName, 'Google');
    assert.equal(google.enabled, true);
    assert.equal(google.accountName, `${GOOGLE_PROVIDER} person`);
    assert.equal(google.avatarUrl, `https://cdn.example.test/${GOOGLE_PROVIDER}.png`);
    assert.equal(google.linkedAt, 3_000);

    const disabled = body.links.find((e) => e.provider === DISABLED_PROVIDER)!;
    assert.equal(disabled.providerName, 'Legacy SSO');
    assert.equal(disabled.enabled, false);
});

test('an empty provider string is reported as no value, not as a blank name', async () => {
    const fixture = new AccountSecurityFixture({
        oauthLinks: [
            oauthLink(GOOGLE_PROVIDER, {
                provider_display_name: '',
                provider_avatar_url: ''
            })
        ]
    });
    const response = await listOAuthLinks(fixture);

    assert.equal(response.status, 200);
    const body = platformOAuthLinkListResponseSchema.parse(await response.json());
    // Both columns are NOT NULL DEFAULT '', so the empty string is the storage
    // encoding for "the provider told us nothing".
    assert.equal(body.links[0]!.accountName, null);
    assert.equal(body.links[0]!.avatarUrl, null);
});

test('a password makes a sole OAuth link removable', async () => {
    const fixture = new AccountSecurityFixture();
    const listed = platformOAuthLinkListResponseSchema.parse(
        await (await listOAuthLinks(fixture)).json()
    );
    assert.deepEqual(listed.links.map((entry) => entry.removable), [true]);

    const response = await unlink(fixture, GOOGLE_PROVIDER);
    assert.equal(response.status, 200);
    assert.deepEqual(
        platformOAuthUnlinkResponseSchema.parse(await response.json()),
        { success: true, provider: GOOGLE_PROVIDER }
    );
    assert.deepEqual(fixture.linkedProviders(), []);
    // The unlink was audited against the right account and event type.
    assert.equal(fixture.unlinkInputs.length, 1);
    assert.equal(fixture.unlinkInputs[0]!.event.eventType, 'auth.oauth.unlinked');
    assert.equal(fixture.unlinkInputs[0]!.accountId, ACCOUNT_ID);
});

test('the link list reports whether a password exists at all', async () => {
    // An OAuth-only account has no password to change. Without this flag the
    // client can only find that out by submitting the form and reading 409,
    // so the answer travels with the login-method list.
    const withoutPassword = new AccountSecurityFixture({
        credential: null,
        oauthLinks: TWO_ENABLED_LINKS
    });
    assert.equal(
        platformOAuthLinkListResponseSchema.parse(
            await (await listOAuthLinks(withoutPassword)).json()
        ).passwordEnabled,
        false
    );

    const withPassword = new AccountSecurityFixture({
        oauthLinks: TWO_ENABLED_LINKS
    });
    assert.equal(
        platformOAuthLinkListResponseSchema.parse(
            await (await listOAuthLinks(withPassword)).json()
        ).passwordEnabled,
        true
    );
});

test('without a password, one of two enabled links can still go', async () => {
    const fixture = new AccountSecurityFixture({
        credential: null,
        oauthLinks: TWO_ENABLED_LINKS
    });
    const listed = platformOAuthLinkListResponseSchema.parse(
        await (await listOAuthLinks(fixture)).json()
    );
    assert.equal(listed.passwordEnabled, false);
    // Either one may go, because removing it leaves a usable sibling.
    assert.deepEqual(listed.links.map((entry) => entry.removable), [true, true]);

    const response = await unlink(fixture, GOOGLE_PROVIDER);
    assert.equal(response.status, 200);
    assert.deepEqual(fixture.linkedProviders(), [GITHUB_PROVIDER]);

    // The survivor is now the last way in, so it must refuse.
    const second = await unlink(fixture, GITHUB_PROVIDER);
    assert.equal(second.status, 409);
    assert.equal(
        ((await second.json()) as ErrorBody).code,
        'PLATFORM_OAUTH_LAST_LOGIN_METHOD'
    );
    assert.deepEqual(fixture.linkedProviders(), [GITHUB_PROVIDER]);
});

test('a disabled provider does not count as a surviving login method', async () => {
    const fixture = new AccountSecurityFixture({
        credential: null,
        oauthLinks: ONE_ENABLED_ONE_DISABLED
    });
    const listed = platformOAuthLinkListResponseSchema.parse(
        await (await listOAuthLinks(fixture)).json()
    );
    // The enabled link is the only one that can complete a sign-in, so it is
    // pinned; the disabled one is dead weight and may go.
    assert.deepEqual(
        listed.links.map((entry) => [entry.provider, entry.removable]),
        [[GOOGLE_PROVIDER, false], [DISABLED_PROVIDER, true]]
    );

    const response = await unlink(fixture, GOOGLE_PROVIDER);

    // The whole point of the guard: counting the disabled link as a survivor
    // would let the user keep only a provider that cannot sign them in, which
    // locks them out of the account permanently.
    assert.equal(response.status, 409);
    assert.equal(
        ((await response.json()) as ErrorBody).code,
        'PLATFORM_OAUTH_LAST_LOGIN_METHOD'
    );
    assert.deepEqual(
        fixture.linkedProviders(),
        [GOOGLE_PROVIDER, DISABLED_PROVIDER].sort()
    );

    // Dropping the unusable one is allowed and leaves the working one in place.
    const disabled = await unlink(fixture, DISABLED_PROVIDER);
    assert.equal(disabled.status, 200);
    assert.deepEqual(fixture.linkedProviders(), [GOOGLE_PROVIDER]);
});

test('a password-less account cannot unlink its only provider', async () => {
    const fixture = new AccountSecurityFixture({
        credential: null,
        oauthLinks: [oauthLink(GOOGLE_PROVIDER)]
    });
    const listed = platformOAuthLinkListResponseSchema.parse(
        await (await listOAuthLinks(fixture)).json()
    );
    assert.deepEqual(listed.links.map((entry) => entry.removable), [false]);

    const response = await unlink(fixture, GOOGLE_PROVIDER);
    assert.equal(response.status, 409);
    assert.equal(
        ((await response.json()) as ErrorBody).code,
        'PLATFORM_OAUTH_LAST_LOGIN_METHOD'
    );
    assert.deepEqual(fixture.linkedProviders(), [GOOGLE_PROVIDER]);
});

test('an unknown provider and another account\'s link are both just missing', async () => {
    const fixture = new AccountSecurityFixture();

    // The foreign account really does have this link; the caller does not.
    // Reporting it as anything but 404 would confirm that it exists elsewhere.
    const foreign = await unlink(fixture, FOREIGN_PROVIDER);
    assert.equal(foreign.status, 404);
    assert.equal(
        ((await foreign.json()) as ErrorBody).code,
        'PLATFORM_OAUTH_LINK_NOT_FOUND'
    );
    assert.deepEqual(fixture.linkedProviders(FOREIGN_ACCOUNT_ID), [FOREIGN_PROVIDER]);

    for (const provider of [
        GITHUB_PROVIDER,   // a real provider this account never linked
        'no-such-provider', // no such row at all
        'Google',           // wrong case: cannot match the column's CHECK
        '-leading-dash',
        'a'.repeat(40)      // longer than the 32-character bound
    ]) {
        const response = await unlink(fixture, provider);
        assert.equal(response.status, 404, `${provider} should be 404`);
        assert.equal(
            ((await response.json()) as ErrorBody).code,
            'PLATFORM_OAUTH_LINK_NOT_FOUND'
        );
    }
    // Nothing was removed along the way.
    assert.deepEqual(fixture.linkedProviders(), [GOOGLE_PROVIDER]);
    // The two malformed codes never reached the repository at all.
    assert.deepEqual(
        fixture.unlinkInputs.map((input) => input.providerCode),
        [FOREIGN_PROVIDER, GITHUB_PROVIDER, 'no-such-provider']
    );
});

test('anonymous and restricted callers cannot unlink', async () => {
    const anonymous = new AccountSecurityFixture();
    for (const response of [
        await anonymous.app.request(OAUTH_LINKS_URL),
        await anonymous.app.request(`${OAUTH_LINKS_URL}/${GOOGLE_PROVIDER}`, {
            method: 'DELETE'
        })
    ]) {
        assert.equal(response.status, 401);
        assert.equal(
            ((await response.json()) as ErrorBody).code,
            'PLATFORM_SESSION_INVALID'
        );
    }
    assert.deepEqual(anonymous.linkedProviders(), [GOOGLE_PROVIDER]);

    const restricted = new AccountSecurityFixture({ accountStatus: 'restricted' });
    const write = await unlink(restricted, GOOGLE_PROVIDER);
    assert.equal(write.status, 403);
    assert.equal(
        ((await write.json()) as ErrorBody).code,
        'PLATFORM_ACCOUNT_RESTRICTED'
    );
    assert.deepEqual(restricted.linkedProviders(), [GOOGLE_PROVIDER]);
    assert.deepEqual(restricted.unlinkInputs, []);

    // Seeing how you can sign in stays readable, matching the device list.
    const listed = await listOAuthLinks(restricted);
    assert.equal(listed.status, 200);
    assert.equal(
        platformOAuthLinkListResponseSchema.parse(await listed.json()).links.length,
        1
    );
});

test('cookie callers must present a matching CSRF token to unlink', async () => {
    const fixture = new AccountSecurityFixture();
    const rejected = await unlink(
        fixture,
        GOOGLE_PROVIDER,
        cookieHeaders({ 'x-csrftoken': 'wrong-secret' })
    );
    assert.equal(rejected.status, 403);
    assert.equal(
        ((await rejected.json()) as ErrorBody).code,
        'PLATFORM_CSRF_INVALID'
    );
    assert.deepEqual(fixture.linkedProviders(), [GOOGLE_PROVIDER]);

    const accepted = await unlink(fixture, GOOGLE_PROVIDER, cookieHeaders());
    assert.equal(accepted.status, 200);
    assert.deepEqual(fixture.linkedProviders(), []);
});

test('the OAuth link endpoints carry their own rate limit buckets', async () => {
    const perIp = new AccountSecurityFixture();
    perIp.rateLimiter.deniedBuckets.add('platform-security-oauth-ip');
    const ipLimited = await unlink(perIp, GOOGLE_PROVIDER);
    assert.equal(ipLimited.status, 429);
    assert.equal(((await ipLimited.json()) as ErrorBody).error, 'Too many requests');
    assert.deepEqual(perIp.linkedProviders(), [GOOGLE_PROVIDER]);
    // The listing shares the same path-level budget.
    assert.equal((await listOAuthLinks(perIp)).status, 429);

    const perAccount = new AccountSecurityFixture();
    perAccount.rateLimiter.deniedBuckets.add('platform-security-oauth-account');
    const accountLimited = await unlink(perAccount, GOOGLE_PROVIDER);
    assert.equal(accountLimited.status, 429);
    assert.equal(
        ((await accountLimited.json()) as ErrorBody).code,
        'PLATFORM_RATE_LIMITED'
    );
    assert.deepEqual(perAccount.linkedProviders(), [GOOGLE_PROVIDER]);
    assert.deepEqual(
        perAccount.rateLimiter.calls.filter(
            (call) => call.bucket === 'platform-security-oauth-account'
        ),
        [{
            bucket: 'platform-security-oauth-account',
            key: ACCOUNT_ID,
            limit: 30
        }]
    );
});

test('account security endpoints carry their own rate limit buckets', async () => {
    const perIp = new AccountSecurityFixture();
    perIp.rateLimiter.deniedBuckets.add('platform-security-password-ip');
    const ipLimited = await changePassword(perIp, passwordBody());
    assert.equal(ipLimited.status, 429);
    assert.equal(((await ipLimited.json()) as ErrorBody).error, 'Too many requests');
    assert.equal(perIp.tokenVersion, 0);

    const perAccount = new AccountSecurityFixture();
    perAccount.rateLimiter.deniedBuckets.add('platform-security-password-account');
    const accountLimited = await changePassword(perAccount, passwordBody());
    assert.equal(accountLimited.status, 429);
    assert.equal(
        ((await accountLimited.json()) as ErrorBody).code,
        'PLATFORM_RATE_LIMITED'
    );
    assert.equal(perAccount.tokenVersion, 0);
    assert.deepEqual(
        perAccount.rateLimiter.calls.filter(
            (call) => call.bucket === 'platform-security-password-account'
        ),
        [{
            bucket: 'platform-security-password-account',
            key: ACCOUNT_ID,
            limit: 10
        }]
    );

    const sessionIp = new AccountSecurityFixture();
    sessionIp.rateLimiter.deniedBuckets.add('platform-security-session-ip');
    assert.equal((await listSessions(sessionIp)).status, 429);

    const sessionAccount = new AccountSecurityFixture();
    sessionAccount.rateLimiter.deniedBuckets.add('platform-security-session-account');
    const revokeLimited = await sessionAccount.app.request(SESSIONS_URL, {
        method: 'DELETE',
        headers: bearerHeaders()
    });
    assert.equal(revokeLimited.status, 429);
    assert.deepEqual(sessionAccount.liveSessionIds().length, 3);
});
