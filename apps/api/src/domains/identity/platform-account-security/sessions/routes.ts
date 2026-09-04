import { handleListPlatformSessions } from '@/domains/identity/platform-account-security/sessions/handlers/list-sessions';
import { handleRevokeOtherPlatformSessions } from '@/domains/identity/platform-account-security/sessions/handlers/revoke-other-sessions';
import { handleRevokePlatformSession } from '@/domains/identity/platform-account-security/sessions/handlers/revoke-session';
import {
    activePlatformMutation,
    platformAuth,
    platformCsrf
} from '@/middleware/hono-auth';
import { platformSessionRateLimit } from '@/middleware/platform-mutation-limit';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

// Reading the device list stays available to a restricted account: seeing where
// you are signed in is how you find out why you were restricted. Revoking is a
// mutation and goes through the full write chain.
export function platformAccountSessionRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get('/sessions', platformAuth, handleListPlatformSessions);
    routes.delete(
        '/sessions',
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformSessionRateLimit,
        handleRevokeOtherPlatformSessions
    );
    routes.delete(
        '/sessions/:id',
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformSessionRateLimit,
        handleRevokePlatformSession
    );
    return routes;
}
