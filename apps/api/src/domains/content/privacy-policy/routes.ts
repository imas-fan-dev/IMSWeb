import { adminPrivacyPolicyUpdateRequestSchema } from '@imsweb/contracts/privacy-policy';
import { adminApiPath, apiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleGetAdminPrivacyPolicy } from '@/domains/content/privacy-policy/handlers/get-admin-privacy-policy';
import { handleGetPrivacyPolicy } from '@/domains/content/privacy-policy/handlers/get-privacy-policy';
import { handleUpdateAdminPrivacyPolicy } from '@/domains/content/privacy-policy/handlers/update-admin-privacy-policy';
import { validateAdminPrivacyPolicyUpdateRequest } from '@/domains/content/privacy-policy/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import { jsonSchemaValidator } from '@/middleware/request-validation';

export function registerPrivacyPolicyRoutes(app: ImsHonoApp): void {
    app.get(apiPath('/privacy-policy'), handleGetPrivacyPolicy);
    app.get(
        adminApiPath('/privacy-policy'),
        backofficeAuth,
        opOnly,
        handleGetAdminPrivacyPolicy
    );
    app.put(
        adminApiPath('/privacy-policy'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonSchemaValidator(adminPrivacyPolicyUpdateRequestSchema, {
            malformedMessage: '请求正文必须为 JSON'
        }, validateAdminPrivacyPolicyUpdateRequest),
        handleUpdateAdminPrivacyPolicy
    );
}
