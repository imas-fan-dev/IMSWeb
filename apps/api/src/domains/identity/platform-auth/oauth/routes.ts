import {
    platformOAuthCallbackQuerySchema,
    platformOAuthProviderParamsSchema,
    platformOAuthStartQuerySchema
} from '@imsweb/contracts/platform';
import {
    platformOAuthProviderCreateRequestSchema,
    platformOAuthProviderDeleteRequestSchema,
    platformOAuthAdminProviderParamsSchema,
    platformOAuthProviderUpdateRequestSchema
} from '@imsweb/contracts/platform/admin';
import type { MiddlewareHandler } from 'hono';
import type { AppEnvironment } from '@/app';
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
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator
} from '@/middleware/request-validation';
import { createCapabilityRouter, type ImsCapabilityRouter } from '@/routing/capability-router';

const publicProviderParams = paramSchemaValidator(platformOAuthProviderParamsSchema) as unknown as MiddlewareHandler<AppEnvironment>;
const publicOAuthStartQuery = querySchemaValidator(platformOAuthStartQuerySchema) as unknown as MiddlewareHandler<AppEnvironment>;
const publicOAuthCallbackQuery = querySchemaValidator(platformOAuthCallbackQuerySchema) as unknown as MiddlewareHandler<AppEnvironment>;
const adminProviderParams = paramSchemaValidator(platformOAuthAdminProviderParamsSchema, {
    invalidMessage: 'OAuth provider 无效'
}) as unknown as MiddlewareHandler<AppEnvironment>;

export function platformOAuthRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get('/providers', handlePlatformOAuthProviders);
    routes.get(
        '/:provider/start',
        publicProviderParams,
        publicOAuthStartQuery,
        handlePlatformOAuthStart
    );
    routes.get(
        '/:provider/callback',
        publicProviderParams,
        publicOAuthCallbackQuery,
        handlePlatformOAuthCallback
    );
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
        jsonSchemaValidator(platformOAuthProviderCreateRequestSchema, {
            malformedMessage: '请求正文必须为 JSON'
        }),
        handleCreateAdminPlatformOAuthProvider,
    );
    routes.put(
        '/:provider',
        backofficeAuth,
        superAdminOnly,
        backofficeCsrf,
        adminProviderParams,
        jsonSchemaValidator(platformOAuthProviderUpdateRequestSchema, {
            malformedMessage: '请求正文必须为 JSON'
        }),
        handleUpdateAdminPlatformOAuthProvider as unknown as MiddlewareHandler<AppEnvironment>,
    );
    routes.delete(
        '/:provider',
        backofficeAuth,
        superAdminOnly,
        backofficeCsrf,
        adminProviderParams,
        jsonSchemaValidator(platformOAuthProviderDeleteRequestSchema, {
            malformedMessage: '请求正文必须为 JSON'
        }),
        handleDeleteAdminPlatformOAuthProvider as unknown as MiddlewareHandler<AppEnvironment>,
    );
    return routes;
}
