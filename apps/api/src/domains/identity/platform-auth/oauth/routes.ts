import { backofficeAuth, backofficeCsrf, superAdminOnly } from '@/middleware/hono-auth';
import {
    handleCreateAdminPlatformOAuthProvider,
    handleDeleteAdminPlatformOAuthProvider,
    handleGetAdminPlatformOAuthProviders,
    handleUpdateAdminPlatformOAuthProvider,
} from '@/domains/identity/platform-auth/oauth/handlers/admin-provider-config';
import {
    handlePlatformOAuthCallback,
    handlePlatformOAuthProviders,
    handlePlatformOAuthStart,
} from '@/domains/identity/platform-auth/oauth/handlers/oauth-login';
import { jsonValidator } from '@/middleware/request-validation';
import {
    parsePlatformOAuthProviderCreate,
    parsePlatformOAuthProviderDelete,
    parsePlatformOAuthProviderUpdate,
} from '@/domains/identity/platform-auth/oauth/request';
import { createCapabilityRouter, type ImsCapabilityRouter } from '@/routing/capability-router';

export function platformOAuthRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get('/providers', handlePlatformOAuthProviders);
    routes.get('/:provider/start', handlePlatformOAuthStart);
    routes.get('/:provider/callback', handlePlatformOAuthCallback);
    return routes;
}

export function platformOAuthAdminRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get('/providers', backofficeAuth, superAdminOnly, handleGetAdminPlatformOAuthProviders);
    routes.post(
        '/providers',
        backofficeAuth,
        superAdminOnly,
        backofficeCsrf,
        jsonValidator(parsePlatformOAuthProviderCreate, {
            malformedMessage: '请求正文必须为 JSON',
        }),
        handleCreateAdminPlatformOAuthProvider,
    );
    routes.put(
        '/:provider',
        backofficeAuth,
        superAdminOnly,
        backofficeCsrf,
        jsonValidator(parsePlatformOAuthProviderUpdate, {
            malformedMessage: '请求正文必须为 JSON',
        }),
        handleUpdateAdminPlatformOAuthProvider,
    );
    routes.delete(
        '/:provider',
        backofficeAuth,
        superAdminOnly,
        backofficeCsrf,
        jsonValidator(parsePlatformOAuthProviderDelete, {
            malformedMessage: '请求正文必须为 JSON',
        }),
        handleDeleteAdminPlatformOAuthProvider,
    );
    return routes;
}
