import {
    adminPlatformEmailConfigurationTestRequestSchema,
    adminPlatformEmailConfigurationWriteRequestSchema,
} from '@imsweb/contracts/platform/admin-email';
import { backofficeAuth, backofficeCsrf, superAdminOnly } from '@/middleware/hono-auth';
import {
    handleGetAdminPlatformEmailSettings,
    handleTestAdminPlatformEmailSettings,
    handleUpdateAdminPlatformEmailSettings,
} from '@/domains/identity/platform-auth/email-settings/handlers/admin-email-settings';
import { jsonSchemaValidator } from '@/middleware/request-validation';
import { createCapabilityRouter, type ImsCapabilityRouter } from '@/routing/capability-router';

export function platformEmailAdminRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get('/', backofficeAuth, superAdminOnly, handleGetAdminPlatformEmailSettings);
    routes.put(
        '/',
        backofficeAuth,
        superAdminOnly,
        backofficeCsrf,
        jsonSchemaValidator(adminPlatformEmailConfigurationWriteRequestSchema, {
            malformedMessage: '请求正文必须为 JSON',
        }),
        handleUpdateAdminPlatformEmailSettings,
    );
    routes.post(
        '/test',
        backofficeAuth,
        superAdminOnly,
        backofficeCsrf,
        jsonSchemaValidator(adminPlatformEmailConfigurationTestRequestSchema, {
            malformedMessage: '请求正文必须为 JSON',
        }),
        handleTestAdminPlatformEmailSettings,
    );
    return routes;
}
