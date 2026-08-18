import type { Context, Next } from 'hono';
import type { AppEnvironment } from '@/app';
import type { ImsHonoApp } from '@/app';
import { backofficeAuth } from '@/middleware/hono-auth';
import { handleCheckBackofficeAuth } from '@/domains/admin/backoffice-auth/handlers/check-auth';
import {
    handleBackofficeAdminLogin,
    handleCanonicalBackofficeLogin,
    handleBackofficeLogin
} from '@/domains/admin/backoffice-auth/handlers/login';
import {
    handleBackofficeLogout,
    handleLegacyBackofficeLogout
} from '@/domains/admin/backoffice-auth/handlers/logout';
import {
    handleBackofficeRefresh,
    handleLegacyBackofficeRefresh
} from '@/domains/admin/backoffice-auth/handlers/refresh';
import {
    loginValidationError,
    validateLoginRequest
} from '@/domains/admin/backoffice-auth/login-request';
import { jsonValidator } from '@/middleware/request-validation';

const loginValidator = jsonValidator(validateLoginRequest, {
    malformedMessage: '用户名或密码格式错误',
    errorBody: loginValidationError
});

const LEGACY_BACKOFFICE_AUTH_SUCCESSORS = new Map([
    ['/api/login', '/api/admin/auth/login'],
    ['/api/admin/login', '/api/admin/auth/login'],
    ['/api/check', '/api/admin/auth/session'],
    ['/api/refresh', '/api/admin/auth/refresh'],
    ['/api/logout', '/api/admin/auth/logout']
]);

async function markLegacyBackofficeAuthRoute(
    c: Context<AppEnvironment>,
    next: Next
): Promise<void> {
    let pathname = '';
    try {
        pathname = new URL(c.req.raw.url).pathname;
    } catch {
        pathname = '';
    }
    console.warn(JSON.stringify({
        event: 'legacy_backoffice_auth_route_used',
        method: c.req.method,
        path: pathname
    }));
    const successor = LEGACY_BACKOFFICE_AUTH_SUCCESSORS.get(pathname) ||
        '/api/admin/auth/session';
    c.header('Deprecation', 'true');
    c.header('Link', `<${successor}>; rel="successor-version"`);
    await next();
}

export function registerBackofficeAuthRoutes(app: ImsHonoApp): void {
    app.post('/api/admin/auth/login', loginValidator, handleCanonicalBackofficeLogin);
    app.get('/api/admin/auth/session', backofficeAuth, handleCheckBackofficeAuth);
    app.post('/api/admin/auth/refresh', handleBackofficeRefresh);
    app.post('/api/admin/auth/logout', handleBackofficeLogout);

    app.post('/api/login', markLegacyBackofficeAuthRoute, loginValidator, handleBackofficeLogin);
    app.post(
        '/api/admin/login',
        markLegacyBackofficeAuthRoute,
        loginValidator,
        handleBackofficeAdminLogin
    );
    app.get(
        '/api/check',
        markLegacyBackofficeAuthRoute,
        backofficeAuth,
        handleCheckBackofficeAuth
    );
    app.post('/api/refresh', markLegacyBackofficeAuthRoute, handleLegacyBackofficeRefresh);
    app.post('/api/logout', markLegacyBackofficeAuthRoute, handleLegacyBackofficeLogout);
}
