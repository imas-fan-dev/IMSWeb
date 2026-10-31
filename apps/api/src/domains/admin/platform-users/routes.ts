import {
    adminPlatformUserIdParamsSchema,
    adminPlatformUserListQuerySchema,
    adminPlatformUserOAuthProviderParamsSchema,
    // pi-lens-ignore: ts:2724
    adminPlatformUserStatusRequestSchema
} from '@imsweb/contracts/platform/admin-users';
import { adminApiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleGetAdminPlatformUser } from '@/domains/admin/platform-users/handlers/get-platform-user';
import { handleListAdminPlatformUsers } from '@/domains/admin/platform-users/handlers/list-platform-users';
import { handleRevokeAdminPlatformUserSessions } from '@/domains/admin/platform-users/handlers/revoke-platform-user-sessions';
import { handleTriggerAdminPlatformUserPasswordReset } from '@/domains/admin/platform-users/handlers/trigger-platform-user-password-reset';
import { handleUnlinkAdminPlatformUserOAuth } from '@/domains/admin/platform-users/handlers/unlink-platform-user-oauth';
import { handleUpdateAdminPlatformUserStatus } from '@/domains/admin/platform-users/handlers/update-platform-user-status';
import { normalizeAdminPlatformUserListQuery } from '@/domains/admin/platform-users/request';
import { backofficeAuth, backofficeCsrf, opOnly, superAdminOnly } from '@/middleware/hono-auth';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator
} from '@/middleware/request-validation';

const PLATFORM_USERS = adminApiPath('/platform/users');

export function registerAdminPlatformUserRoutes(app: ImsHonoApp): void {
    app.get(
        PLATFORM_USERS,
        backofficeAuth,
        opOnly,
        superAdminOnly,
        querySchemaValidator(
            adminPlatformUserListQuerySchema,
            { invalidMessage: '检索条件无效' },
            normalizeAdminPlatformUserListQuery
        ),
        handleListAdminPlatformUsers
    );
    app.get(
        adminApiPath('/platform/users/:id'),
        backofficeAuth,
        opOnly,
        superAdminOnly,
        paramSchemaValidator(adminPlatformUserIdParamsSchema, {
            invalidMessage: '平台用户 ID 无效'
        }),
        handleGetAdminPlatformUser
    );
    app.put(
        adminApiPath('/platform/users/:id/status'),
        backofficeAuth,
        opOnly,
        superAdminOnly,
        backofficeCsrf,
        paramSchemaValidator(adminPlatformUserIdParamsSchema, {
            invalidMessage: '平台用户 ID 无效'
        }),
        jsonSchemaValidator(adminPlatformUserStatusRequestSchema, {
            malformedMessage: '请求正文必须为 JSON',
            invalidMessage: '帐号状态参数无效'
        }),
        handleUpdateAdminPlatformUserStatus
    );
    app.delete(
        adminApiPath('/platform/users/:id/sessions'),
        backofficeAuth,
        opOnly,
        superAdminOnly,
        backofficeCsrf,
        paramSchemaValidator(adminPlatformUserIdParamsSchema, {
            invalidMessage: '平台用户 ID 无效'
        }),
        handleRevokeAdminPlatformUserSessions
    );
    app.post(
        adminApiPath('/platform/users/:id/password-reset'),
        backofficeAuth,
        opOnly,
        superAdminOnly,
        backofficeCsrf,
        paramSchemaValidator(adminPlatformUserIdParamsSchema, {
            invalidMessage: '平台用户 ID 无效'
        }),
        handleTriggerAdminPlatformUserPasswordReset
    );
    app.delete(
        adminApiPath('/platform/users/:id/oauth-links/:provider'),
        backofficeAuth,
        opOnly,
        superAdminOnly,
        backofficeCsrf,
        paramSchemaValidator(adminPlatformUserOAuthProviderParamsSchema, {
            invalidMessage: '平台用户 OAuth 解绑参数无效'
        }),
        handleUnlinkAdminPlatformUserOAuth
    );
}
