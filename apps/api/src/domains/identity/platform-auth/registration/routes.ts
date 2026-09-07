import {
    platformRegisterRequestSchema,
    platformRegistrationVerificationRequestSchema
} from '@imsweb/contracts/platform';
import { handlePlatformRegister } from '@/domains/identity/platform-auth/registration/handlers/register';
import { handlePlatformRegistrationVerification } from '@/domains/identity/platform-auth/registration/handlers/send-verification-code';
import {
    platformJsonInputInvalid,
    requirePlatformJson
} from '@/domains/identity/platform-auth/platform-json-request';
import { jsonSchemaValidator } from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

export function platformRegistrationRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.post(
        '/register/verification-code',
        requirePlatformJson,
        jsonSchemaValidator(platformRegistrationVerificationRequestSchema, {
            errorBody: platformJsonInputInvalid
        }),
        handlePlatformRegistrationVerification
    );
    routes.post(
        '/register',
        requirePlatformJson,
        jsonSchemaValidator(platformRegisterRequestSchema, {
            errorBody: platformJsonInputInvalid
        }),
        handlePlatformRegister
    );
    return routes;
}
