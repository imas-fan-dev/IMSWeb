import { adminApiPath, apiPath } from '@imsweb/contracts/paths';
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
    [apiPath('/login'), adminApiPath('/auth/login')],
    [adminApiPath('/login'), adminApiPath('/auth/login')],
    [apiPath('/check'), adminApiPath('/auth/session')],
    [apiPath('/refresh'), adminApiPath('/auth/refresh')],
    [apiPath('/logout'), adminApiPath('/auth/logout')]
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
        adminApiPath('/auth/session');
    c.header('Deprecation', 'true');
    c.header('Link', `<${successor}>; rel="successor-version"`);
    await next();
}

export function registerBackofficeAuthRoutes(app: ImsHonoApp): void {
    app.post(adminApiPath('/auth/login'), loginValidator, handleCanonicalBackofficeLogin);
    app.get(adminApiPath('/auth/session'), backofficeAuth, handleCheckBackofficeAuth);
    app.post(adminApiPath('/auth/refresh'), handleBackofficeRefresh);
    app.post(adminApiPath('/auth/logout'), handleBackofficeLogout);

    app.post(apiPath('/login'), markLegacyBackofficeAuthRoute, loginValidator, handleBackofficeLogin);
    app.post(
        adminApiPath('/login'),
        markLegacyBackofficeAuthRoute,
        loginValidator,
        handleBackofficeAdminLogin
    );
    app.get(
        apiPath('/check'),
        markLegacyBackofficeAuthRoute,
        backofficeAuth,
        handleCheckBackofficeAuth
    );
    app.post(apiPath('/refresh'), markLegacyBackofficeAuthRoute, handleLegacyBackofficeRefresh);
    app.post(apiPath('/logout'), markLegacyBackofficeAuthRoute, handleLegacyBackofficeLogout);
}
