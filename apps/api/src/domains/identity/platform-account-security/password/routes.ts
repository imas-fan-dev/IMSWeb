import { handleChangePlatformPassword } from '@/domains/identity/platform-account-security/password/handlers/change-password';
import {
    activePlatformMutation,
    platformAuth,
    platformCsrf
} from '@/middleware/hono-auth';
import { platformPasswordRateLimit } from '@/middleware/platform-mutation-limit';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

export function platformPasswordRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.post(
        '/password',
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformPasswordRateLimit,
        handleChangePlatformPassword
    );
    return routes;
}
