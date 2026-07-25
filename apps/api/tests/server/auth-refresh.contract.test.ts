import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHonoApp } from '@/app';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { SqliteConnection } from '@/infra/db/sqlite/connection';
import { SqliteSchemaStrategy } from '@/infra/db/sqlite/schema-strategy';
import { HmacTokenService } from '@/infra/security/hmac/token-service';
import { hashAuthSecret } from '@/domains/auth/auth-session';
import type { RuntimeServices } from '@/ports/runtime-services';

const USERNAME = 'refresh-contract-op';
const PASSWORD = 'refresh-contract-password';

interface AuthFixture {
    app: ReturnType<typeof createHonoApp>;
    repository: SqlCoreRepository;
    close(): Promise<void>;
}

function setCookies(response: Response): string[] {
    return (response.headers as Headers & { getSetCookie(): string[] }).getSetCookie();
}

function cookieValues(response: Response): Map<string, string> {
    return new Map(setCookies(response).map((cookie) => {
        const [pair] = cookie.split(';', 1);
        const separator = pair!.indexOf('=');
        return [pair!.slice(0, separator), decodeURIComponent(pair!.slice(separator + 1))];
    }));
}

function cookieHeader(values: Map<string, string>): string {
    return [...values].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; ');
}

function jwtPayload(token: string): Record<string, unknown> {
    const payload = token.split('.')[1];
    if (!payload) throw new Error('JWT payload is missing');
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

async function createFixture(): Promise<AuthFixture> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-auth-refresh-'));
    const connection = new SqliteConnection(path.join(root, 'core.sqlite'));
    const repository = new SqlCoreRepository(connection, new SqliteSchemaStrategy());
    await repository.initialize();
    await connection.run(
        `INSERT INTO users (username, password, dept, producername)
         VALUES (?, 'refresh-contract-digest', 'op', 'Refresh Contract Producer')`,
        [USERNAME]
    );
    const runtime: RuntimeServices = {
        auth: repository,
        audit: repository,
        passwords: {
            async verify(value, digest) {
                return value === PASSWORD && digest === 'refresh-contract-digest';
            }
        },
        tokens: new HmacTokenService('refresh-contract-secret-at-least-thirty-two-bytes'),
        config: { cookieSecure: false }
    };
    return {
        app: createHonoApp(() => runtime),
        repository,
        async close() {
            await repository.close();
            await fs.rm(root, { recursive: true, force: true });
        }
    };
}

async function login(fixture: AuthFixture): Promise<{
    response: Response;
    cookies: Map<string, string>;
    body: { token: string };
}> {
    const response = await fixture.app.request('http://ims.test/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: USERNAME, password: PASSWORD })
    });
    return {
        response,
        cookies: cookieValues(response),
        body: await response.json() as { token: string }
    };
}

test('access JWT login creates a rotating refresh session with CSRF binding', async (t) => {
    const fixture = await createFixture();
    t.after(() => fixture.close());

    const session = await login(fixture);
    assert.equal(session.response.status, 200);
    assert.deepEqual([...session.cookies.keys()].sort(), [
        'csrf_token',
        'refresh_token',
        'token'
    ]);
    const claims = jwtPayload(session.body.token);
    assert.equal(Number(claims.exp) - Number(claims.iat), 15 * 60);

    const refreshToken = session.cookies.get('refresh_token')!;
    const csrf = session.cookies.get('csrf_token')!;
    const stored = await fixture.repository.findRefreshSessionByTokenHash(
        await hashAuthSecret(refreshToken)
    );
    assert.ok(stored);
    assert.equal(stored.token_hash, await hashAuthSecret(refreshToken));
    assert.notEqual(stored.token_hash, refreshToken);

    const missingCsrf = await fixture.app.request('http://ims.test/api/refresh', {
        method: 'POST',
        headers: { Cookie: cookieHeader(session.cookies) }
    });
    assert.equal(missingCsrf.status, 403);

    const refreshed = await fixture.app.request('http://ims.test/api/refresh', {
        method: 'POST',
        headers: {
            Cookie: cookieHeader(session.cookies),
            'X-CSRFToken': csrf
        }
    });
    assert.equal(refreshed.status, 200);
    const nextCookies = cookieValues(refreshed);
    assert.notEqual(nextCookies.get('token'), session.cookies.get('token'));
    assert.notEqual(nextCookies.get('refresh_token'), refreshToken);
    assert.equal(nextCookies.get('csrf_token'), csrf);

    const check = await fixture.app.request('http://ims.test/api/check', {
        headers: { Cookie: cookieHeader(nextCookies) }
    });
    assert.equal(check.status, 200);

    const replayCookies = new Map(nextCookies);
    replayCookies.set('refresh_token', refreshToken);
    const replay = await fixture.app.request('http://ims.test/api/refresh', {
        method: 'POST',
        headers: {
            Cookie: cookieHeader(replayCookies),
            'X-CSRFToken': csrf
        }
    });
    assert.equal(replay.status, 401);

    const revokedSuccessor = await fixture.app.request('http://ims.test/api/refresh', {
        method: 'POST',
        headers: {
            Cookie: cookieHeader(nextCookies),
            'X-CSRFToken': csrf
        }
    });
    assert.equal(revokedSuccessor.status, 401);
});

test('logout revokes the refresh session and clears all authentication cookies', async (t) => {
    const fixture = await createFixture();
    t.after(() => fixture.close());

    const session = await login(fixture);
    const csrf = session.cookies.get('csrf_token')!;
    const logout = await fixture.app.request('http://ims.test/api/logout', {
        method: 'POST',
        headers: {
            Cookie: cookieHeader(session.cookies),
            'X-CSRFToken': csrf
        }
    });
    assert.equal(logout.status, 200);
    assert.deepEqual(
        setCookies(logout).map((cookie) => cookie.split('=', 1)[0]).sort(),
        ['csrf_token', 'refresh_token', 'token']
    );
    for (const cookie of setCookies(logout)) assert.match(cookie, /Max-Age=0/i);

    const refresh = await fixture.app.request('http://ims.test/api/refresh', {
        method: 'POST',
        headers: {
            Cookie: cookieHeader(session.cookies),
            'X-CSRFToken': csrf
        }
    });
    assert.equal(refresh.status, 401);
});
