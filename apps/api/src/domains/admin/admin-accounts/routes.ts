import {
    // pi-lens-ignore: ts:2724
    adminAccountIdParamsSchema,
    // pi-lens-ignore: ts:2305
    adminCreateAccountRequestSchema
} from '@imsweb/contracts/admin';
import { adminApiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import {
    normalizeAdminAccountIdParams
} from '@/domains/admin/admin-accounts/request';
import { handleCreateAdminAccount } from '@/domains/admin/admin-accounts/handlers/create-admin-account';
import {
    createAdminAccountValidationError,
    normalizeCreateAdminAccountRequest
} from '@/domains/admin/admin-accounts/create-admin-account-request';
import { handleDeleteAdminAccount } from '@/domains/admin/admin-accounts/handlers/delete-admin-account';
import { handleListAdminAccounts } from '@/domains/admin/admin-accounts/handlers/list-admin-accounts';
import { backofficeAuth, backofficeCsrf, opOnly, superAdminOnly } from '@/middleware/hono-auth';
import {
    jsonSchemaValidator,
    paramSchemaValidator
} from '@/middleware/request-validation';

export function registerAdminAccountRoutes(app: ImsHonoApp): void {
    app.get(
        adminApiPath('/accounts'),
        backofficeAuth,
        opOnly,
        superAdminOnly,
        handleListAdminAccounts
    );
    app.post(
        adminApiPath('/accounts'),
        backofficeAuth,
        opOnly,
        superAdminOnly,
        backofficeCsrf,
        jsonSchemaValidator(adminCreateAccountRequestSchema, {
            invalidMessage: '管理员账号信息格式错误',
            malformedMessage: '管理员账号信息格式错误',
            errorBody: createAdminAccountValidationError
        }, normalizeCreateAdminAccountRequest),
        handleCreateAdminAccount
    );
    app.delete(
        adminApiPath('/accounts/:id'),
        backofficeAuth,
        opOnly,
        superAdminOnly,
        backofficeCsrf,
        paramSchemaValidator(adminAccountIdParamsSchema, {
            invalidMessage: '管理员账号 ID 无效',
            errorBody: createAdminAccountValidationError
        }, normalizeAdminAccountIdParams),
        handleDeleteAdminAccount
    );
}
