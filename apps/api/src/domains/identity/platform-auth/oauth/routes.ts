import {
    platformOAuthCallbackQuerySchema,
    platformOAuthExchangeRequestSchema,
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
    handlePlatformOAuthExchange,
    oauthExchangeInputInvalid
} from '@/domains/identity/platform-auth/oauth/handlers/oauth-exchange';
import { requirePlatformJson } from '@/domains/identity/platform-auth/platform-json-request';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator
} from '@/middleware/request-validation';
import { createCapabilityRouter, type ImsCapabilityRouter } from '@/routing/capability-router';

// SAFETY: param/query validators run before the validated-request context is
// recorded, so their handler type cannot name it; Hono's registration signature
// only accepts the generic `MiddlewareHandler` shape.
const publicProviderParams = paramSchemaValidator(platformOAuthProviderParamsSchema) as unknown as MiddlewareHandler<AppEnvironment>;
// SAFETY: see above — query validation precedes context narrowing.
const publicOAuthStartQuery = querySchemaValidator(platformOAuthStartQuerySchema) as unknown as MiddlewareHandler<AppEnvironment>;
// SAFETY: see above — query validation precedes context narrowing.
const publicOAuthCallbackQuery = querySchemaValidator(platformOAuthCallbackQuerySchema) as unknown as MiddlewareHandler<AppEnvironment>;
// SAFETY: see above — param validation precedes context narrowing.
const adminProviderParams = paramSchemaValidator(platformOAuthAdminProviderParamsSchema, {
    invalidMessage: 'OAuth provider 无效'
}) as unknown as MiddlewareHandler<AppEnvironment>;

export function platformOAuthRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.post(
        '/exchange',
        requirePlatformJson,
        jsonSchemaValidator(platformOAuthExchangeRequestSchema, {
            errorBody: oauthExchangeInputInvalid,
            malformedMessage: 'PLATFORM_OAUTH_EXCHANGE_INVALID'
        }),
        handlePlatformOAuthExchange
    );
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
        // SAFETY: registered after the JSON validator, so the narrowed validated
        // context the handler declares is guaranteed to exist here.
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
        // SAFETY: registered after the JSON validator, so the narrowed validated
        // context the handler declares is guaranteed to exist here.
        handleDeleteAdminPlatformOAuthProvider as unknown as MiddlewareHandler<AppEnvironment>,
    );
    return routes;
}
