// pi-lens-ignore: ts:2724
import { platformPasswordChangeRequestSchema } from '@imsweb/contracts/platform/account-security';
// pi-lens-ignore: ts:2305
import type { PlatformAuthError } from '@imsweb/contracts/platform';
import { handleChangePlatformPassword } from '@/domains/identity/platform-account-security/password/handlers/change-password';
import { requirePlatformJson } from '@/domains/identity/platform-auth/platform-json-request';
import {
    activePlatformMutation,
    platformAuth,
    platformCsrf
} from '@/middleware/hono-auth';
import { platformPasswordRateLimit } from '@/middleware/platform-mutation-limit';
import { jsonSchemaValidator } from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

function passwordValidationErrorBody(): PlatformAuthError {
    return {
        success: false,
        code: 'PLATFORM_PASSWORD_INPUT_INVALID'
    };
}

export function platformPasswordRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.post(
        '/password',
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformPasswordRateLimit,
        requirePlatformJson,
        jsonSchemaValidator(platformPasswordChangeRequestSchema, {
            errorBody: passwordValidationErrorBody
        }),
        handleChangePlatformPassword
    );
    return routes;
}
