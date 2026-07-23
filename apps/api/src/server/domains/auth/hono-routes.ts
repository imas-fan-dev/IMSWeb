import { deleteCookie, setCookie } from 'hono/cookie';
import type { ImsHonoApp } from '@/app';
import { coreAuth } from '@/middleware/hono-auth';
import { coreRepository, getClientAddress, randomHex, services } from '@/shared/hono-utils';

export function registerAuthRoutes(app: ImsHonoApp): void {
    app.post('/api/login', async (c) => {
        let body: Record<string, unknown>;
        try {
            body = await c.req.json<Record<string, unknown>>();
        } catch {
            return c.json({ success: false, message: '用户名或密码格式错误' }, 400);
        }
        const { username, password } = body;
        if (
            typeof username !== 'string' || typeof password !== 'string' ||
            username.length < 1 || username.length > 128 ||
            password.length < 1 || new TextEncoder().encode(password).byteLength > 1024
        ) {
            return c.json({ success: false, message: '用户名或密码格式错误' }, 400);
        }
        const runtime = services(c);
        if (!runtime.passwords || !runtime.tokens) throw new Error('Authentication services unavailable');
        const user = await coreRepository(c).findUserByUsername(username);
        if (!user || !await runtime.passwords.verify(password, user.password)) {
            return c.json({ success: false, message: '用户名或密码错误' }, 401);
        }
        const csrfSecret = randomHex(32);
        const token = await runtime.tokens.sign({
            id: user.id,
            username: user.username,
            producername: user.producername || '',
            dept: user.dept,
            csrfSecret
        }, 2 * 60 * 60);
        try {
            await coreRepository(c).insertAuditLog({
                username: user.username,
                producername: user.producername || '',
                action: '登录',
                target: '-',
                ip: getClientAddress(c),
                time: new Date().toISOString()
            });
        } catch (error) {
            console.error(error);
        }
        const cookieOptions = {
            secure: runtime.config?.cookieSecure ?? false,
            sameSite: 'Lax' as const,
            path: '/'
        };
        setCookie(c, 'token', token, { ...cookieOptions, httpOnly: true });
        setCookie(c, 'csrf_token', csrfSecret, { ...cookieOptions, httpOnly: false });
        return c.json({
            success: true,
            token,
            username: user.username,
            producername: user.producername,
            dept: user.dept
        });
    });

    app.get('/api/check', coreAuth, (c) => c.json({ success: true, user: c.get('user') }));

    app.post('/api/logout', (c) => {
        const secure = services(c).config?.cookieSecure ?? false;
        const cookieOptions = { path: '/', secure, sameSite: 'Lax' as const };
        deleteCookie(c, 'token', { ...cookieOptions, httpOnly: true });
        deleteCookie(c, 'csrf_token', { ...cookieOptions, httpOnly: false });
        return c.json({ success: true });
    });
}
