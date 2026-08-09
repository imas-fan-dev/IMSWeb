import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnvironment } from '@/app';
import {
    CSRF_TOKEN_COOKIE,
    REFRESH_TOKEN_COOKIE
} from '@/domains/auth/auth-session';

export interface AuthenticationCookieRequest {
    refreshToken: string | undefined;
    csrfHeader: string;
    csrfCookie: string;
}

export function parseAuthenticationCookieRequest(
    c: Context<AppEnvironment>
): AuthenticationCookieRequest {
    return {
        refreshToken: getCookie(c, REFRESH_TOKEN_COOKIE),
        csrfHeader: c.req.header('x-csrftoken') || c.req.header('x-csrf-token') || '',
        csrfCookie: getCookie(c, CSRF_TOKEN_COOKIE) || ''
    };
}
