import { platformLoginRequestSchema } from '@imsweb/contracts/platform';
import { platformAuth } from '@/middleware/hono-auth';
import { handlePlatformLogin } from '@/domains/identity/platform-auth/sessions/handlers/login';
import { handlePlatformLogout } from '@/domains/identity/platform-auth/sessions/handlers/logout';
import { handlePlatformRefresh } from '@/domains/identity/platform-auth/sessions/handlers/refresh';
import { handlePlatformSession } from '@/domains/identity/platform-auth/sessions/handlers/session';
import {
    platformJsonInputInvalid,
    requirePlatformJson
} from '@/domains/identity/platform-auth/platform-json-request';
import { jsonSchemaValidator } from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

export function platformSessionRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.post(
        '/login',
        requirePlatformJson,
        jsonSchemaValidator(platformLoginRequestSchema, {
            errorBody: platformJsonInputInvalid
        }),
        handlePlatformLogin
    );
    routes.get('/session', platformAuth, handlePlatformSession);
    routes.post('/refresh', handlePlatformRefresh);
    routes.post('/logout', handlePlatformLogout);
    return routes;
}
