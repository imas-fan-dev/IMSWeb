import {
    platformOAuthLinkAppStartRequestSchema,
    platformOAuthLinkParamsSchema,
    platformOAuthLinkStartQuerySchema,
    // pi-lens-ignore: ts:2724
    platformOAuthLinkRouteParamsSchema
} from '@imsweb/contracts/platform/account-security';
import type { MiddlewareHandler } from 'hono';
import type { AppEnvironment } from '@/app';
import { handleListPlatformOAuthLinks } from '@/domains/identity/platform-account-security/oauth-links/handlers/list-oauth-links';
import { handleStartPlatformOAuthLink } from '@/domains/identity/platform-account-security/oauth-links/handlers/start-oauth-link';
import {
    handleStartPlatformOAuthLinkApp,
    oauthLinkAppInputInvalid
} from '@/domains/identity/platform-account-security/oauth-links/handlers/start-oauth-link-app';
import { handleUnlinkPlatformOAuthLink } from '@/domains/identity/platform-account-security/oauth-links/handlers/unlink-oauth-link';
import { requirePlatformJson } from '@/domains/identity/platform-auth/platform-json-request';
import {
    activePlatformMutation,
    platformAuth,
    platformCsrf
} from '@/middleware/hono-auth';
import { platformOAuthLinkRateLimit } from '@/middleware/platform-mutation-limit';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator
} from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

function concealedOAuthLinkParams(value: unknown): { provider: string | undefined } {
    const parsed = platformOAuthLinkParamsSchema.safeParse(value);
    return parsed.success ? parsed.data : { provider: undefined };
}

// SAFETY: the generic `MiddlewareHandler` export erases `AppEnvironment`, so
// the route cannot name the adapter's narrowed param context; the cast restores
// it at registration only.
const appLinkAppProviderParams = paramSchemaValidator(
    platformOAuthLinkParamsSchema,
    {},
    concealedOAuthLinkParams
) as unknown as MiddlewareHandler<AppEnvironment>;

export function platformOAuthLinkRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get('/oauth-links', platformAuth, handleListPlatformOAuthLinks);
    // A GET still carries the full account-security write chain. CSRF is a
    // no-op on GET; the state row is bound to the caller's account and the
    // provider round trip is protected by PKCE, which is what actually fences
    // this hand-off.
    routes.get(
        '/oauth-links/:provider/start',
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformOAuthLinkRateLimit,
        paramSchemaValidator(
            platformOAuthLinkParamsSchema,
            {},
            concealedOAuthLinkParams
        ),
        querySchemaValidator(platformOAuthLinkStartQuerySchema),
        handleStartPlatformOAuthLink
    );
    // The packaged app cannot carry its bearer session across the document
    // navigation the GET performs, so it starts the same round trip through an
    // authenticated JSON call and receives the provider URL to open in the
    // system browser. The state row records `clientTarget: 'app'`.
    routes.post(
        '/oauth-links/:provider/start',
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformOAuthLinkRateLimit,
        requirePlatformJson,
        appLinkAppProviderParams,
        jsonSchemaValidator(platformOAuthLinkAppStartRequestSchema, {
            errorBody: oauthLinkAppInputInvalid,
            malformedMessage: 'PLATFORM_OAUTH_LINK_INPUT_INVALID'
        }),
        // SAFETY: registered after the JSON validator, so the narrowed validated
        // context the handler declares is guaranteed to exist here.
        handleStartPlatformOAuthLinkApp as unknown as MiddlewareHandler<AppEnvironment>
    );
    routes.delete(
        '/oauth-links/:provider',
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformOAuthLinkRateLimit,
        paramSchemaValidator(
            platformOAuthLinkRouteParamsSchema,
            {},
            concealedOAuthLinkParams
        ),
        handleUnlinkPlatformOAuthLink
    );
    return routes;
}
