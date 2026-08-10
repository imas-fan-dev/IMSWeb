import type { ImsHonoApp } from '@/app';
import {
    validateAdminAccountIdParams
} from '@/domains/admin-accounts/request';
import { handleCreateAdminAccount } from '@/domains/admin-accounts/handlers/create-admin-account';
import {
    createAdminAccountValidationError,
    validateCreateAdminAccountRequest
} from '@/domains/admin-accounts/create-admin-account-request';
import { handleDeleteAdminAccount } from '@/domains/admin-accounts/handlers/delete-admin-account';
import { handleListAdminAccounts } from '@/domains/admin-accounts/handlers/list-admin-accounts';
import { backofficeAuth, backofficeCsrf, opOnly, superAdminOnly } from '@/middleware/hono-auth';
import { jsonValidator, paramValidator } from '@/middleware/request-validation';

export function registerAdminAccountRoutes(app: ImsHonoApp): void {
    app.get(
        '/api/admin/accounts',
        backofficeAuth,
        opOnly,
        superAdminOnly,
        handleListAdminAccounts
    );
    app.post(
        '/api/admin/accounts',
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
        '/api/admin/accounts/:id',
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
