import { deleteCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { AuthenticationCookieRequest } from '@/domains/auth/request';
import type { RefreshSessionRecord, UserRecord } from '@/ports/repositories';
import type { JwtClaims } from '@/ports/security';
import { constantTimeEqual } from '@/utils/crypto/constant-time';
import { randomHex } from '@/utils/crypto/random';
import { sha256Hex } from '@/utils/crypto/sha256';

export const ACCESS_TOKEN_COOKIE = 'token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const CSRF_TOKEN_COOKIE = 'csrf_token';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

function cookieOptions(c: Context<AppEnvironment>) {
    return {
        secure: c.get('services').config?.cookieSecure ?? false,
        sameSite: 'Lax' as const
    };
}

export function setAuthenticationCookies(
    c: Context<AppEnvironment>,
    values: { accessToken: string; refreshToken: string; csrfSecret: string }
): void {
    const common = cookieOptions(c);
    setCookie(c, ACCESS_TOKEN_COOKIE, values.accessToken, {
        ...common,
        httpOnly: true,
        maxAge: ACCESS_TOKEN_TTL_SECONDS,
        path: '/'
    });
    setCookie(c, REFRESH_TOKEN_COOKIE, values.refreshToken, {
        ...common,
        httpOnly: true,
        maxAge: REFRESH_TOKEN_TTL_SECONDS,
        path: '/api'
    });
    setCookie(c, CSRF_TOKEN_COOKIE, values.csrfSecret, {
        ...common,
        httpOnly: false,
        maxAge: REFRESH_TOKEN_TTL_SECONDS,
        path: '/'
    });
}

export function clearAuthenticationCookies(c: Context<AppEnvironment>): void {
    const common = cookieOptions(c);
    deleteCookie(c, ACCESS_TOKEN_COOKIE, { ...common, httpOnly: true, path: '/' });
    deleteCookie(c, REFRESH_TOKEN_COOKIE, { ...common, httpOnly: true, path: '/api' });
    deleteCookie(c, CSRF_TOKEN_COOKIE, { ...common, httpOnly: false, path: '/' });
}

export async function hashAuthSecret(value: string): Promise<string> {
    return sha256Hex(new TextEncoder().encode(value));
}

export async function hasValidRefreshCsrf(
    request: AuthenticationCookieRequest,
    session: RefreshSessionRecord
): Promise<boolean> {
    if (!constantTimeEqual(request.csrfHeader, request.csrfCookie)) return false;
    return constantTimeEqual(
        await hashAuthSecret(request.csrfHeader),
        session.csrf_hash
    );
}

export function accessTokenClaims(
    user: UserRecord,
    csrfSecret: string
): Omit<JwtClaims, 'iat' | 'exp'> {
    return {
        id: user.id,
        username: user.username,
        producername: user.producername || '',
        dept: user.dept,
        adminRole: user.admin_role,
        csrfSecret,
        jti: randomHex(16)
    };
}
