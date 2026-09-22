'use strict';

const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
    assertCoreAuthContract,
    assertRejectedJwtContract
} = require('../contracts/runtime-contracts.js');

function jwtPart(value) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function signJwtWithWebCrypto(header, claims, secret, hash = 'SHA-256') {
    const signingInput = `${jwtPart(header)}.${jwtPart(claims)}`;
    const key = await nodeCrypto.webcrypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash },
        false,
        ['sign']
    );
    const signature = await nodeCrypto.webcrypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(signingInput)
    );
    return `${signingInput}.${Buffer.from(signature).toString('base64url')}`;
}

async function verifyJwtWithWebCrypto(token, secret) {
    const [header, payload, signature] = token.split('.');
    const key = await nodeCrypto.webcrypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
    );
    return nodeCrypto.webcrypto.subtle.verify(
        'HMAC',
        key,
        Buffer.from(signature, 'base64url'),
        new TextEncoder().encode(`${header}.${payload}`)
    );
}

async function getOpToken(fixture) {
    const response = await fetch(`${fixture.baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'security-test-op', password: 'test-password' })
    });
    assert.equal(response.status, 200);
    return (await response.json()).token;
}

async function getOpSession(fixture) {
    const response = await fetch(`${fixture.baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'security-test-op', password: 'test-password' })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    const cookies = response.headers.getSetCookie().map(value => value.split(';', 1)[0]);
    const csrfCookie = cookies.find(value => value.startsWith('csrf_token='));
    return {
        token: body.token,
        cookie: cookies.join('; '),
        csrf: decodeURIComponent(csrfCookie.slice('csrf_token='.length))
    };
}

function loginTokenCookie(fixture) {
    return async () => {
        const { baseUrl } = fixture;
        const response = await fetch(`${baseUrl}/api/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: 'security-test-op', password: 'test-password' })
        });
        assert.equal(response.status, 200);
        const cookies = response.headers.getSetCookie();
        const tokenCookie = cookies.find(cookie => cookie.startsWith('token='));
        assert.ok(tokenCookie, 'token cookie is present');
        assert.match(tokenCookie, /; HttpOnly/i);
    };
}

function malformedLoginInput(fixture) {
    return async () => {
        const { baseUrl } = fixture;
        for (const body of [
            { username: 'security-test-op' },
            { username: 'security-test-op', password: null },
            { username: 'security-test-op', password: {} }
        ]) {
            const response = await fetch(`${baseUrl}/api/login`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body)
            });
            assert.equal(response.status, 400);
        }
        assert.equal((await fetch(`${baseUrl}/api/news`)).status, 200);
    };
}

function cookieWritesRequireCsrf(fixture) {
    return async () => {
        const { baseUrl, getOpSession } = fixture;
        const session = await getOpSession();
        const withoutCsrf = await fetch(`${baseUrl}/api/events`, {
            method: 'POST',
            headers: { cookie: session.cookie }
        });
        assert.equal(withoutCsrf.status, 403);

        const wrongCsrf = await fetch(`${baseUrl}/api/events`, {
            method: 'POST',
            headers: { cookie: session.cookie, 'x-csrftoken': 'wrong' }
        });
        assert.equal(wrongCsrf.status, 403);

        const withCsrf = await fetch(`${baseUrl}/api/events`, {
            method: 'POST',
            headers: { cookie: session.cookie, 'x-csrftoken': session.csrf }
        });
        assert.equal(withCsrf.status, 400);

        const bearer = await fetch(`${baseUrl}/api/events`, {
            method: 'POST',
            headers: { authorization: `Bearer ${session.token}` }
        });
        assert.equal(bearer.status, 400);
    };
}

function sharedAuthContract(fixture) {
    return async () => {
        const { baseUrl, fixturePool, get, namecardObjectPath, namecardThumbnailObjectPath, run, seedLegacyNamecard, TEST_FILE_PREFIX, validJpeg, validPng } = fixture;
        const userRow = await get(fixturePool, "SELECT id, username, dept FROM users WHERE username='security-test-op'");
        const user = { ...userRow, id: Number(userRow.id) };
        const contractFrontUrl = `/uploads/namecard/original/${TEST_FILE_PREFIX}-contract-front.png`;
        const contractBackUrl = `/uploads/namecard/original/${TEST_FILE_PREFIX}-contract-back.png`;
        for (const mediaUrl of [contractFrontUrl, contractBackUrl]) {
            const target = namecardObjectPath(mediaUrl);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, validPng);
            fs.writeFileSync(namecardThumbnailObjectPath(mediaUrl), validJpeg);
        }
        const contractCardId = await seedLegacyNamecard(fixturePool, {
            frontUrl: contractFrontUrl,
            backUrl: contractBackUrl,
            hash1: 'contract-front',
            hash2: 'contract-back',
            ip: '127.0.0.1',
            status: 'pending'
        });

        const request = (requestPath, init) => fetch(`${baseUrl}${requestPath}`, init);
        try {
            await assertCoreAuthContract({
                runtime: 'Node',
                expectedUser: user,
                request,
                cookieMutationPath: `/api/admin/cards/approve/${contractCardId}`,
                cookieMutationContentType: 'application/json',
                cookieMutationBody: JSON.stringify({ expected_revision: 0 }),
                secureCookies: false,
                async login() {
                    const response = await request('/api/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: 'security-test-op', password: 'test-password' })
                    });
                    const body = await response.json();
                    const cookies = response.headers.getSetCookie().map((value) => value.split(';', 1)[0]);
                    const csrfCookie = cookies.find((value) => value.startsWith('csrf_token='));
                    return {
                        response,
                        token: body.token,
                        cookie: cookies.join('; '),
                        csrf: decodeURIComponent(csrfCookie.slice('csrf_token='.length))
                    };
                },
                async assertMutationState(state) {
                    // Approval writes fudaba_cards; cards is a frozen archive.
                    // publication_status keeps the unified vocabulary, so the
                    // legacy 'approved' reads back as 'published' here.
                    const row = await get(
                        fixturePool,
                        'SELECT publication_status FROM fudaba_cards WHERE card_number=?',
                        [contractCardId]
                    );
                    assert.equal(row.publication_status, state === 'before' ? 'pending' : 'published');
                },
                async resetMutation() {
                    await run(
                        fixturePool,
                        `UPDATE fudaba_cards SET publication_status='pending', revision=0
                         WHERE card_number=?`,
                        [contractCardId]
                    );
                },
                setCookies(response) {
                    return response.headers.getSetCookie();
                }
            });
        } finally {
            await run(fixturePool, 'DELETE FROM fudaba_cards WHERE card_number=?', [contractCardId]);
            await run(fixturePool, 'DELETE FROM cards WHERE id=?', [contractCardId]);
            for (const mediaUrl of [contractFrontUrl, contractBackUrl]) {
                const target = namecardObjectPath(mediaUrl);
                fs.rmSync(path.dirname(target), { recursive: true, force: true });
            }
        }
    };
}

function jwtInteroperability(fixture) {
    return async () => {
        const { baseUrl, getOpSession } = fixture;
        const secret = process.env.IMS_JWT_SECRET;
        const now = Math.floor(Date.now() / 1000);
        const nodeSession = await getOpSession();
        const nodeClaims = JSON.parse(
            Buffer.from(nodeSession.token.split('.')[1], 'base64url').toString('utf8')
        );
        assert.equal(typeof nodeClaims.iss, 'string');
        assert.equal(nodeClaims.aud, 'ims-backoffice');
        assert.equal(nodeClaims.kind, 'backoffice');
        const claims = {
            id: 1,
            username: 'webcrypto-minted-op',
            producername: 'WebCrypto Minted',
            dept: 'op',
            csrfSecret: 'webcrypto-minted-csrf',
            iss: nodeClaims.iss,
            aud: 'ims-backoffice',
            kind: 'backoffice',
            iat: now,
            exp: now + 600
        };
        const webCryptoMinted = await signJwtWithWebCrypto({ alg: 'HS256', typ: 'JWT' }, claims, secret);
        const accepted = await fetch(`${baseUrl}/api/admin/auth/session`, {
            headers: { Authorization: `Bearer ${webCryptoMinted}` }
        });
        assert.equal(accepted.status, 200);
        assert.equal((await accepted.json()).user.username, 'webcrypto-minted-op');

        assert.equal(await verifyJwtWithWebCrypto(nodeSession.token, secret), true);

        await assertRejectedJwtContract({
            runtime: 'Node',
            request: (requestPath, init) => fetch(`${baseUrl}${requestPath}`, init),
            tokens: {
                'non-HS256': await signJwtWithWebCrypto(
                    { alg: 'HS512', typ: 'JWT' }, claims, secret, 'SHA-512'
                ),
                expired: await signJwtWithWebCrypto(
                    { alg: 'HS256', typ: 'JWT' }, { ...claims, iat: now - 120, exp: now - 60 }, secret
                ),
                'missing-CSRF-claim': await signJwtWithWebCrypto(
                    { alg: 'HS256', typ: 'JWT' }, { ...claims, csrfSecret: undefined }, secret
                ),
                'missing-issuer': await signJwtWithWebCrypto(
                    { alg: 'HS256', typ: 'JWT' }, { ...claims, iss: undefined }, secret
                ),
                'wrong-issuer': await signJwtWithWebCrypto(
                    { alg: 'HS256', typ: 'JWT' }, { ...claims, iss: `${claims.iss}-other` }, secret
                ),
                'missing-audience': await signJwtWithWebCrypto(
                    { alg: 'HS256', typ: 'JWT' }, { ...claims, aud: undefined }, secret
                ),
                'platform-audience': await signJwtWithWebCrypto(
                    { alg: 'HS256', typ: 'JWT' }, { ...claims, aud: 'ims-platform' }, secret
                ),
                'missing-kind': await signJwtWithWebCrypto(
                    { alg: 'HS256', typ: 'JWT' }, { ...claims, kind: undefined }, secret
                ),
                'platform-kind': await signJwtWithWebCrypto(
                    { alg: 'HS256', typ: 'JWT' }, { ...claims, kind: 'platform' }, secret
                ),
                'wrong-secret': await signJwtWithWebCrypto(
                    { alg: 'HS256', typ: 'JWT' }, claims, 'wrong-secret-that-is-at-least-32-bytes'
                )
            }
        });
    };
}

function registerAuthTests(fixture) {
    const { test } = fixture;
    test('login token cookie is HttpOnly', () => loginTokenCookie(fixture)());
    test('malformed login input is rejected without terminating the server', () =>
        malformedLoginInput(fixture)());
    test('cookie-authenticated writes require CSRF while bearer writes remain compatible', () =>
        cookieWritesRequireCsrf(fixture)());
    test('[AUTH-01 CORE-01] shared auth contract runs against Node PostgreSQL and filesystem services', () =>
        sharedAuthContract(fixture)());
    test('[AUTH-01] Node and WebCrypto JWTs interoperate and invalid token classes stay rejected', () =>
        jwtInteroperability(fixture)());
}

module.exports = { getOpSession, getOpToken, registerAuthTests };
