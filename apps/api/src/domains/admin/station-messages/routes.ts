import {
    adminStationMessageIdParamsSchema,
    adminStationMessageListQuerySchema,
    adminStationMessageRecipientQuerySchema,
    adminStationMessageSendRequestSchema
} from '@imsweb/contracts/platform/admin-station-messages';
import { adminApiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import {
    handleCancelAdminStationMessage,
    handleListAdminStationMessageDeliveries,
    handleListAdminStationMessageRecipients,
    handleListAdminStationMessages,
    handleSendAdminStationMessage
} from '@/domains/admin/station-messages/handlers/station-messages';
import {
    normalizeAdminStationMessageListQuery,
    normalizeAdminStationMessageRecipientQuery
} from '@/domains/admin/station-messages/request';
import { backofficeAuth, backofficeCsrf, opOnly, superAdminOnly } from '@/middleware/hono-auth';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator
} from '@/middleware/request-validation';

// 站内信是「谁能发」的问题，先由超管独占；权限细分留给后续的 admin 角色改造。
const STATION_MESSAGES = adminApiPath('/platform/messages');

export function registerAdminStationMessageRoutes(app: ImsHonoApp): void {
    app.get(
        STATION_MESSAGES,
        backofficeAuth,
        opOnly,
        superAdminOnly,
        querySchemaValidator(
            adminStationMessageListQuerySchema,
            { invalidMessage: '分页参数无效' },
            normalizeAdminStationMessageListQuery
        ),
        handleListAdminStationMessages
    );
    app.get(
        adminApiPath('/platform/messages/recipients'),
        backofficeAuth,
        opOnly,
        superAdminOnly,
        querySchemaValidator(
            adminStationMessageRecipientQuerySchema,
            { invalidMessage: '收件人检索条件无效' },
            normalizeAdminStationMessageRecipientQuery
        ),
        handleListAdminStationMessageRecipients
    );
    app.get(
        adminApiPath('/platform/messages/:id/recipients'),
        backofficeAuth,
        opOnly,
        superAdminOnly,
        paramSchemaValidator(adminStationMessageIdParamsSchema, {
            invalidMessage: '站内信 ID 无效'
        }),
        handleListAdminStationMessageDeliveries
    );
    app.post(
        STATION_MESSAGES,
        backofficeAuth,
        opOnly,
        superAdminOnly,
        backofficeCsrf,
        jsonSchemaValidator(adminStationMessageSendRequestSchema, {
            malformedMessage: '请求正文必须为 JSON',
            invalidMessage: '站内信内容无效'
        }),
        handleSendAdminStationMessage
    );
    app.post(
        adminApiPath('/platform/messages/:id/cancel'),
        backofficeAuth,
        opOnly,
        superAdminOnly,
        backofficeCsrf,
        paramSchemaValidator(adminStationMessageIdParamsSchema, {
            invalidMessage: '站内信 ID 无效'
        }),
        handleCancelAdminStationMessage
    );
}
