import {
    platformPasswordResetRequestSchema,
    platformPasswordResetSubmissionSchema
} from '@imsweb/contracts/platform';
import {
    handlePlatformPasswordReset,
    handlePlatformPasswordResetVerification
} from '@/domains/identity/platform-auth/password-reset/handlers/reset-password';
import {
    platformJsonInputInvalid,
    requirePlatformJson
} from '@/domains/identity/platform-auth/platform-json-request';
import { jsonSchemaValidator } from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

export function platformPasswordResetRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.post(
        '/password-reset/verification-code',
        requirePlatformJson,
        jsonSchemaValidator(platformPasswordResetRequestSchema, {
            errorBody: platformJsonInputInvalid
        }),
        handlePlatformPasswordResetVerification
    );
    routes.post(
        '/password-reset',
        requirePlatformJson,
        jsonSchemaValidator(platformPasswordResetSubmissionSchema, {
            errorBody: platformJsonInputInvalid
        }),
        handlePlatformPasswordReset
    );
    return routes;
}
