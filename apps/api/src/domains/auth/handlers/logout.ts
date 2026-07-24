import { deleteCookie } from 'hono/cookie';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { services } from '@/middleware/hono-context';

export function handleLogout(c: Context<AppEnvironment>): Response {
    const secure = services(c).config?.cookieSecure ?? false;
    const cookieOptions = { path: '/', secure, sameSite: 'Lax' as const };
    deleteCookie(c, 'token', { ...cookieOptions, httpOnly: true });
    deleteCookie(c, 'csrf_token', { ...cookieOptions, httpOnly: false });
    return c.json({ success: true });
}
