import type { PlatformAuthError } from '@imsweb/contracts/platform';
import {
    platformEmailBindRequestSchema,
    platformEmailChangeRequestSchema,
    // pi-lens-ignore: ts:2724
    platformEmailVerificationCodeRequestSchema
} from '@imsweb/contracts/platform/account-security';
import { handleBindPlatformEmailCredential } from '@/domains/identity/platform-account-security/email/handlers/bind-email-credential';
import { handleChangePlatformEmailCredential } from '@/domains/identity/platform-account-security/email/handlers/change-email-credential';
import { handleGetPlatformEmailCredential } from '@/domains/identity/platform-account-security/email/handlers/get-email-credential';
import { handleSendPlatformEmailBindingCode } from '@/domains/identity/platform-account-security/email/handlers/send-email-binding-code';
import { requirePlatformJson } from '@/domains/identity/platform-auth/platform-json-request';
import {
    activePlatformMutation,
    platformAuth,
    platformCsrf
} from '@/middleware/hono-auth';
import { platformEmailCredentialRateLimit } from '@/middleware/platform-mutation-limit';
import { jsonSchemaValidator } from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

function emailValidationErrorBody(): PlatformAuthError {
    return {
        success: false,
        code: 'PLATFORM_EMAIL_INPUT_INVALID'
    };
}

/**
 * Email credential binding for a signed-in account.
 *
 * Every write shares the account-security chain: the caller is authenticated,
 * the account must allow mutations, and the request must clear CSRF and the
 * account-dimension rate limit. The GET has no CSRF to enforce but still
 * demands the session that makes the read meaningful.
 */
export function platformEmailRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get('/email', platformAuth, handleGetPlatformEmailCredential);
    routes.post(
        '/email/verification-code',
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformEmailCredentialRateLimit,
        requirePlatformJson,
        jsonSchemaValidator(platformEmailVerificationCodeRequestSchema, {
            errorBody: emailValidationErrorBody
        }),
        handleSendPlatformEmailBindingCode
    );
    routes.post(
        '/email/bind',
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformEmailCredentialRateLimit,
        requirePlatformJson,
        jsonSchemaValidator(platformEmailBindRequestSchema, {
            errorBody: emailValidationErrorBody
        }),
        handleBindPlatformEmailCredential
    );
    routes.post(
        '/email/change',
        platformAuth,
        activePlatformMutation,
        platformCsrf,
        platformEmailCredentialRateLimit,
        requirePlatformJson,
        jsonSchemaValidator(platformEmailChangeRequestSchema, {
            errorBody: emailValidationErrorBody
        }),
        handleChangePlatformEmailCredential
    );
    return routes;
}
