import { adminApiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import {
    validateAdminAccountIdParams
} from '@/domains/admin/admin-accounts/request';
import { handleCreateAdminAccount } from '@/domains/admin/admin-accounts/handlers/create-admin-account';
import {
    createAdminAccountValidationError,
    validateCreateAdminAccountRequest
} from '@/domains/admin/admin-accounts/create-admin-account-request';
import { handleDeleteAdminAccount } from '@/domains/admin/admin-accounts/handlers/delete-admin-account';
import { handleListAdminAccounts } from '@/domains/admin/admin-accounts/handlers/list-admin-accounts';
import { backofficeAuth, backofficeCsrf, opOnly, superAdminOnly } from '@/middleware/hono-auth';
import { jsonValidator, paramValidator } from '@/middleware/request-validation';

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
        jsonValidator(validateCreateAdminAccountRequest, {
            malformedMessage: '管理员账号信息格式错误',
            errorBody: createAdminAccountValidationError
        }),
        handleCreateAdminAccount
    );
    app.delete(
        adminApiPath('/accounts/:id'),
        backofficeAuth,
        opOnly,
        superAdminOnly,
        backofficeCsrf,
        paramValidator(validateAdminAccountIdParams, {
            errorBody: createAdminAccountValidationError
        }),
        handleDeleteAdminAccount
    );
}
