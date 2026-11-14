import {
    platformSessionParamsSchema,
    // pi-lens-ignore: ts:2724
    platformSessionRouteParamsSchema
} from '@imsweb/contracts/platform/account-security';
import { handleListPlatformSessions } from '@/domains/identity/platform-account-security/sessions/handlers/list-sessions';
import { handleRevokeOtherPlatformSessions } from '@/domains/identity/platform-account-security/sessions/handlers/revoke-other-sessions';
import { handleRevokePlatformSession } from '@/domains/identity/platform-account-security/sessions/handlers/revoke-session';
import {
    activePlatformMutation,
    platformAuth,
    platformCsrf
} from '@/middleware/hono-auth';
import { platformSessionRateLimit } from '@/middleware/platform-mutation-limit';
import { paramSchemaValidator } from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

function concealedSessionParams(value: unknown): { id: string | undefined } {
    const parsed = platformSessionParamsSchema.safeParse(value);
    return parsed.success ? parsed.data : { id: undefined };
}

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
        paramSchemaValidator(
            platformSessionRouteParamsSchema,
            {},
            concealedSessionParams
        ),
        handleRevokePlatformSession
    );
    return routes;
}
