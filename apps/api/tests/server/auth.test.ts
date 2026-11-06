// Merged from 2 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import { bearerTokenHeaders, cookieCsrfHeaders, fixtureSha256Hex, readSetCookieValues, readSetCookieValues as cookieValues, serializeCookieHeader, serializeCookieHeader as cookieHeader, setCookieHeaders, setCookieHeaders as setCookies } from '../fixtures/auth-request';
import { insertUser } from '../fixtures/rows';
import { createPostgresTestDatabase, postgresTest } from '../postgres-test-database';
import { createTestApp, testRequest } from './test-app';
import { hashBackofficeAuthSecret } from '@/domains/admin/backoffice-auth/backoffice-auth-session';
import { PostgresConnection } from '@/infra/db/postgresql/connection';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlAuditRepository } from '@/infra/db/repositories/audit-repository';
import { SqlBackofficeAuthRepository } from '@/infra/db/repositories/backoffice-auth-repository';
import { queryOne } from '@/infra/db/sql/query';
import { HmacBackofficeTokenService } from '@/infra/security/hmac/token-service';
import type { RuntimeServices } from '@/ports/runtime-services';
import assert from 'node:assert/strict';
import { describe, onTestFinished, test } from 'vitest';

// auth-refresh.contract.test.ts
{
    const USERNAME = 'refresh-contract-op';
    const NON_OP_USERNAME = 'refresh-contract-user';
    const PASSWORD = 'refresh-contract-password';

    interface AuthFixture {
        app: ReturnType<typeof createTestApp>;
        connection: PostgresConnection;
        repository: SqlBackofficeAuthRepository;
        close(): Promise<void>;
    }

    function jwtPayload(token: string): Record<string, unknown> {
        const payload = token.split('.')[1];
        if (!payload) throw new Error('JWT payload is missing');
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    }

    async function createFixture(): Promise<AuthFixture> {
        const connection = await createPostgresTestDatabase('auth-refresh');
        await new PostgresqlSchemaStrategy().initializeCore(connection);
        const repository = new SqlBackofficeAuthRepository(connection);
        const audit = new SqlAuditRepository(connection);
        await insertUser(connection, USERNAME, {
            password: 'refresh-contract-digest',
            producername: 'Refresh Contract Producer',
            admin_role: 'admin'
        });
        await insertUser(connection, NON_OP_USERNAME, {
            password: 'refresh-contract-digest',
            dept: 'user',
            producername: 'Refresh Contract User',
            admin_role: null
        });
        const runtime: RuntimeServices = {
            backofficeAuth: repository,
            audit,
            passwords: {
                async verify(value, digest) {
                    return value === PASSWORD && digest === 'refresh-contract-digest';
                }
            },
            backofficeTokens: new HmacBackofficeTokenService(
                'refresh-contract-secret-at-least-thirty-two-bytes'
            ),
            config: { cookieSecure: false }
        };
        return {
            app: createTestApp(() => runtime),
            connection,
            repository,
            async close() {
                await connection.close();
            }
        };
    }

    async function login(
        fixture: AuthFixture,
        options: { path?: string; username?: string } = {}
    ): Promise<{
        response: Response;
        cookies: Map<string, string>;
        body: { success: boolean; token?: string; message?: string };
    }> {
        const response = await testRequest(
            fixture.app,
            options.path || '/api/login',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: options.username || USERNAME,
                    password: PASSWORD
                })
            }
        );
        return {
            response,
            cookies: cookieValues(response),
            body: await response.json() as {
                success: boolean;
                token?: string;
                message?: string;
            }
        };
    }

    describe('auth refresh', () => {
        postgresTest('admin login rejects non-op users before creating a refresh session', async () => {
            const fixture = await createFixture();
            onTestFinished(() => fixture.close());

            const denied = await login(fixture, {
                path: '/api/admin/login',
                username: NON_OP_USERNAME
            });
            assert.equal(denied.response.status, 403);
            assert.deepEqual(denied.body, {
                success: false,
                message: '当前账号没有管理工作台权限'
            });
            assert.deepEqual(setCookies(denied.response), []);
            assert.deepEqual(
                await queryOne<{ total: number }>(fixture.connection,
                    'SELECT COUNT(*) AS total FROM auth_refresh_sessions'
                ),
                { total: 0 }
            );

            const regularLogin = await login(fixture, { username: NON_OP_USERNAME });
            assert.equal(regularLogin.response.status, 200);
        });

        postgresTest('admin login issues a refresh session for op users', async () => {
            const fixture = await createFixture();
            onTestFinished(() => fixture.close());

            const session = await login(fixture, { path: '/api/admin/login' });
            assert.equal(session.response.status, 200);
            assert.deepEqual([...session.cookies.keys()].sort(), [
                'csrf_token',
                'refresh_token',
                'token'
            ]);
        });

        postgresTest('access JWT login creates a rotating refresh session with CSRF binding', async () => {
            const fixture = await createFixture();
            onTestFinished(() => fixture.close());

            const session = await login(fixture);
            assert.equal(session.response.status, 200);
            assert.deepEqual([...session.cookies.keys()].sort(), [
                'csrf_token',
                'refresh_token',
                'token'
            ]);
            const token = session.body.token;
            assert.ok(token);
            const claims = jwtPayload(token);
            assert.equal(Number(claims.exp) - Number(claims.iat), 15 * 60);

            const refreshToken = session.cookies.get('refresh_token')!;
            const csrf = session.cookies.get('csrf_token')!;
            const stored = await fixture.repository.findRefreshSessionByTokenHash(
                await hashBackofficeAuthSecret(refreshToken)
            );
            assert.ok(stored);
            assert.equal(stored.token_hash, await hashBackofficeAuthSecret(refreshToken));
            assert.notEqual(stored.token_hash, refreshToken);

            const missingCsrf = await testRequest(fixture.app, '/api/refresh', {
                method: 'POST',
                headers: { Cookie: cookieHeader(session.cookies) }
            });
            assert.equal(missingCsrf.status, 403);

            const refreshed = await testRequest(fixture.app, '/api/refresh', {
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

            const check = await testRequest(fixture.app, '/api/check', {
                headers: { Cookie: cookieHeader(nextCookies) }
            });
            assert.equal(check.status, 200);

            const replayCookies = new Map(nextCookies);
            replayCookies.set('refresh_token', refreshToken);
            const replay = await testRequest(fixture.app, '/api/refresh', {
                method: 'POST',
                headers: {
                    Cookie: cookieHeader(replayCookies),
                    'X-CSRFToken': csrf
                }
            });
            assert.equal(replay.status, 401);

            const revokedSuccessor = await testRequest(fixture.app, '/api/refresh', {
                method: 'POST',
                headers: {
                    Cookie: cookieHeader(nextCookies),
                    'X-CSRFToken': csrf
                }
            });
            assert.equal(revokedSuccessor.status, 401);
        });

        postgresTest('logout revokes the refresh session and clears all authentication cookies', async () => {
            const fixture = await createFixture();
            onTestFinished(() => fixture.close());

            const session = await login(fixture);
            const csrf = session.cookies.get('csrf_token')!;
            const logout = await testRequest(fixture.app, '/api/logout', {
                method: 'POST',
                headers: {
                    Cookie: cookieHeader(session.cookies),
                    'X-CSRFToken': csrf
                }
            });
            assert.equal(logout.status, 200);
            assert.deepEqual(
                setCookies(logout).map((cookie) => cookie.split('=', 1)[0]).sort(),
                [
                    'csrf_token',
                    'ims_admin_access',
                    'ims_admin_csrf',
                    'ims_admin_refresh',
                    'refresh_token',
                    'token'
                ]
            );
            for (const cookie of setCookies(logout)) assert.match(cookie, /Max-Age=0/i);

            const refresh = await testRequest(fixture.app, '/api/refresh', {
                method: 'POST',
                headers: {
                    Cookie: cookieHeader(session.cookies),
                    'X-CSRFToken': csrf
                }
            });
            assert.equal(refresh.status, 401);
        });
    });
}

// auth-request-helper.test.ts
{
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

    test.describe('auth request helpers', () => {
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
    });
}
