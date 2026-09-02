import { handleListPlatformOAuthLinks } from '@/domains/identity/platform-account-security/oauth-links/handlers/list-oauth-links';
import { handleUnlinkPlatformOAuthLink } from '@/domains/identity/platform-account-security/oauth-links/handlers/unlink-oauth-link';
import {
    activePlatformMutation,
    platformAuth,
    platformCsrf
} from '@/middleware/hono-auth';
import { platformOAuthLinkRateLimit } from '@/middleware/platform-mutation-limit';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

// Reading the linked providers stays available to a restricted account, on the
// same reasoning as the device list: seeing how you can sign in is part of
// understanding your own account. Unlinking is a mutation and takes the full
// write chain.
export function platformOAuthLinkRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get('/oauth-links', platformAuth, handleListPlatformOAuthLinks);
    routes.delete(
        '/oauth-links/:provider',
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformOAuthLinkRateLimit,
        handleUnlinkPlatformOAuthLink
    );
    return routes;
}
