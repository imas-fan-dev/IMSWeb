import {
    backofficeAuth,
    backofficeCsrf,
    superAdminOnly
} from '@/middleware/hono-auth';
import {
    handleGetAdminPlatformOAuthProviders,
    handleUpdateAdminPlatformOAuthProvider
} from '@/domains/identity/platform-auth/oauth/handlers/admin-provider-config';
import {
    handlePlatformOAuthCallback,
    handlePlatformOAuthProviders,
    handlePlatformOAuthStart
} from '@/domains/identity/platform-auth/oauth/handlers/oauth-login';
import { jsonValidator } from '@/middleware/request-validation';
import { parsePlatformOAuthProviderUpdate } from '@/domains/identity/platform-auth/oauth/request';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

export function platformOAuthRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get('/providers', handlePlatformOAuthProviders);
    routes.get('/:provider/start', handlePlatformOAuthStart);
    routes.get('/:provider/callback', handlePlatformOAuthCallback);
    return routes;
}

export function platformOAuthAdminRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        '/providers',
        backofficeAuth,
        superAdminOnly,
        handleGetAdminPlatformOAuthProviders
    );
    routes.put(
        '/:provider',
        backofficeAuth,
        superAdminOnly,
        backofficeCsrf,
        jsonValidator(parsePlatformOAuthProviderUpdate, {
            malformedMessage: '请求正文必须为 JSON'
        }),
        handleUpdateAdminPlatformOAuthProvider
    );
    return routes;
}
