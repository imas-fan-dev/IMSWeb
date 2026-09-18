import {
    platformOAuthLinkParamsSchema,
    platformOAuthLinkStartQuerySchema,
    // pi-lens-ignore: ts:2724
    platformOAuthLinkRouteParamsSchema
} from '@imsweb/contracts/platform/account-security';
import { handleListPlatformOAuthLinks } from '@/domains/identity/platform-account-security/oauth-links/handlers/list-oauth-links';
import { handleStartPlatformOAuthLink } from '@/domains/identity/platform-account-security/oauth-links/handlers/start-oauth-link';
import { handleUnlinkPlatformOAuthLink } from '@/domains/identity/platform-account-security/oauth-links/handlers/unlink-oauth-link';
import {
    activePlatformMutation,
    platformAuth,
    platformCsrf
} from '@/middleware/hono-auth';
import { platformOAuthLinkRateLimit } from '@/middleware/platform-mutation-limit';
import { paramSchemaValidator, querySchemaValidator } from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

function concealedOAuthLinkParams(value: unknown): { provider: string | undefined } {
    const parsed = platformOAuthLinkParamsSchema.safeParse(value);
    return parsed.success ? parsed.data : { provider: undefined };
}

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
