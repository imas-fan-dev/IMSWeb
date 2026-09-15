import assert from 'node:assert/strict';
import test from 'node:test';
import {
    bearerTokenHeaders,
    cookieCsrfHeaders,
    fixtureSha256Hex,
    readSetCookieValues,
    serializeCookieHeader,
    setCookieHeaders
} from '../fixtures/auth-request';

const PLATFORM_ACCESS = 'ims_platform_access';
const PLATFORM_CSRF = 'ims_platform_csrf';
const BACKOFFICE_ACCESS = 'ims_admin_access';
const BACKOFFICE_CSRF = 'ims_admin_csrf';

function platformCookieHeaders(csrfHeader: string | null, csrfCookie = 'platform=csrf') {
    return cookieCsrfHeaders([
        [PLATFORM_ACCESS, 'platform=session=token'],
        [PLATFORM_CSRF, csrfCookie]
    ], csrfHeader);
}

function backofficeCookieHeaders(csrfHeader: string | null) {
    return cookieCsrfHeaders([
        [BACKOFFICE_ACCESS, 'backoffice=session=token'],
        [BACKOFFICE_CSRF, 'backoffice=csrf']
    ], csrfHeader);
}

test('Set-Cookie parsing preserves multiple headers and encoded equals signs', () => {
    const headers = new Headers();
    headers.append('set-cookie', 'session=a%3Db%3Dc; Path=/; HttpOnly');
    headers.append('set-cookie', 'csrf=x%3Dy; Path=/');
    const response = new Response(null, { headers });

    assert.equal(setCookieHeaders(response).length, 2);
    const values = readSetCookieValues(response);
    assert.deepEqual([...values], [['session', 'a=b=c'], ['csrf', 'x=y']]);
    assert.equal(serializeCookieHeader(values), 'session=a%3Db%3Dc; csrf=x%3Dy');
});

test('Bearer and CSRF primitives preserve explicit missing and mismatched states', () => {
    assert.deepEqual(bearerTokenHeaders('token=value', { accept: 'application/json' }), {
        authorization: 'Bearer token=value',
        accept: 'application/json'
    });
    assert.deepEqual(platformCookieHeaders(null), {
        cookie: 'ims_platform_access=platform%3Dsession%3Dtoken; ' +
            'ims_platform_csrf=platform%3Dcsrf'
    });
    assert.equal(
        platformCookieHeaders('different-csrf')['x-csrftoken'],
        'different-csrf'
    );
});

test('realm wrappers keep Platform and Backoffice cookie names isolated', () => {
    const platform = platformCookieHeaders('platform=csrf');
    const backoffice = backofficeCookieHeaders('backoffice=csrf');
    assert.doesNotMatch(platform.cookie, /ims_admin_/);
    assert.doesNotMatch(backoffice.cookie, /ims_platform_/);
});

test('fixture hashing is deterministic SHA-256', () => {
    assert.equal(
        fixtureSha256Hex('fixture'),
        'f16d05ec6b29248d2c61adb1e9263f78e4f7bace1b955014a2d17872cfe4064d'
    );
});
