import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnvironment } from '@/app';
import {
    BACKOFFICE_CSRF_TOKEN_COOKIE,
    BACKOFFICE_REFRESH_TOKEN_COOKIE
} from '@/domains/backoffice-auth/backoffice-auth-session';

export interface AuthenticationCookieRequest {
    refreshToken: string | undefined;
    csrfHeader: string;
    csrfCookie: string;
}

export function parseAuthenticationCookieRequest(
    c: Context<AppEnvironment>
): AuthenticationCookieRequest {
    return {
        refreshToken: getCookie(c, BACKOFFICE_REFRESH_TOKEN_COOKIE),
        csrfHeader: c.req.header('x-csrftoken') || c.req.header('x-csrf-token') || '',
        csrfCookie: getCookie(c, BACKOFFICE_CSRF_TOKEN_COOKIE) || ''
    };
}
