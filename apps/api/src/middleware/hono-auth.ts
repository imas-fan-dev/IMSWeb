import type { Context, MiddlewareHandler, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnvironment } from '@/app';
import { authRepository, services } from '@/middleware/hono-context';
import { constantTimeEqual } from '@/utils/crypto/constant-time';

export async function authenticateCoreRequest(c: Context<AppEnvironment>): Promise<Response | null> {
    const authorization = (c.req.header('authorization') || '').trim();
    const token = authorization
        ? authorization.replace(/^Bearer\s+/i, '')
        : getCookie(c, 'token');
    if (!token) return c.json({ success: false, message: '未登录' }, 401);
    const tokenService = services(c).tokens;
    if (!tokenService) return c.json({ success: false, message: 'token无效' }, 401);
    try {
        c.set('user', await tokenService.verify(token));
        c.set('authSource', authorization ? 'authorization' : 'cookie');
    } catch {
        return c.json({ success: false, message: 'token无效' }, 401);
    }
    return null;
}

export async function authenticateCore(c: Context<AppEnvironment>, next: Next): Promise<Response | void> {
    const failure = await authenticateCoreRequest(c);
    if (failure) return failure;
    await next();
}

export async function requireOp(c: Context<AppEnvironment>, next: Next): Promise<Response | void> {
    const claims = c.get('user');
    if (claims?.dept !== 'op') {
        return c.json({ message: '无权限（仅op可访问）' }, 403);
    }
    await next();
}

export async function requireSuperAdmin(
    c: Context<AppEnvironment>,
    next: Next
): Promise<Response | void> {
    const claims = c.get('user');
    if (!claims) return c.json({ success: false, message: '未登录' }, 401);
    const current = await authRepository(c).findUserById(claims.id);
    if (
        !current || current.dept !== 'op' ||
        current.admin_role !== 'super_admin'
    ) {
        return c.json({ success: false, message: '仅最高管理员可执行此操作' }, 403);
    }
    c.set('user', { ...claims, adminRole: current.admin_role });
    await next();
}

export async function protectCoreCsrf(c: Context<AppEnvironment>, next: Next): Promise<Response | void> {
    if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) || c.get('authSource') === 'authorization') {
        await next();
        return;
    }
    const header = c.req.header('x-csrftoken') || c.req.header('x-csrf-token') || '';
    const cookie = getCookie(c, 'csrf_token');
    if (!constantTimeEqual(header, cookie) || !constantTimeEqual(header, c.get('user')?.csrfSecret)) {
        return c.json({ success: false, message: 'CSRF token invalid' }, 403);
    }
    await next();
}

export const coreAuth: MiddlewareHandler<AppEnvironment> = authenticateCore;
export const opOnly: MiddlewareHandler<AppEnvironment> = requireOp;
export const superAdminOnly: MiddlewareHandler<AppEnvironment> = requireSuperAdmin;
export const coreCsrf: MiddlewareHandler<AppEnvironment> = protectCoreCsrf;
