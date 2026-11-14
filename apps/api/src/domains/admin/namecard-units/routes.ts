import {
    namecardUnitCreateRequestSchema,
    namecardUnitDeleteQuerySchema,
    namecardUnitIdParamsSchema,
    namecardUnitListQuerySchema,
    namecardUnitUpdateRequestSchema
} from '@imsweb/contracts/fudaba/admin-units';
import { adminApiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleCreateAdminNamecardUnit } from '@/domains/admin/namecard-units/handlers/create-unit';
import { handleDeleteAdminNamecardUnit } from '@/domains/admin/namecard-units/handlers/delete-unit';
import { handleListAdminNamecardUnits } from '@/domains/admin/namecard-units/handlers/list-units';
import { handleUpdateAdminNamecardUnit } from '@/domains/admin/namecard-units/handlers/update-unit';
import {
    normalizeNamecardUnitCreateRequest,
    normalizeNamecardUnitDeleteQuery,
    normalizeNamecardUnitIdParams,
    normalizeNamecardUnitListQuery,
    normalizeNamecardUnitUpdateRequest
} from '@/domains/admin/namecard-units/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator
} from '@/middleware/request-validation';

const UNITS = adminApiPath('/cards/units');
const UNIT = adminApiPath('/cards/units/:id');

export function registerAdminNamecardUnitRoutes(app: ImsHonoApp): void {
    app.get(
        UNITS,
        backofficeAuth,
        opOnly,
        querySchemaValidator(
            namecardUnitListQuerySchema,
            { invalidMessage: '检索条件无效' },
            normalizeNamecardUnitListQuery
        ),
        handleListAdminNamecardUnits
    );
    app.post(
        UNITS,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonSchemaValidator(
            namecardUnitCreateRequestSchema,
            {
                malformedMessage: '请求正文必须为 JSON',
                invalidMessage: '名片组合参数无效'
            },
            normalizeNamecardUnitCreateRequest
        ),
        handleCreateAdminNamecardUnit
    );
    app.patch(
        UNIT,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        paramSchemaValidator(
            namecardUnitIdParamsSchema,
            { invalidMessage: '名片组合 ID 无效' },
            normalizeNamecardUnitIdParams
        ),
        jsonSchemaValidator(
            namecardUnitUpdateRequestSchema,
            {
                malformedMessage: '请求正文必须为 JSON',
                invalidMessage: '名片组合参数无效'
            },
            normalizeNamecardUnitUpdateRequest
        ),
        handleUpdateAdminNamecardUnit
    );
    app.delete(
        UNIT,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        paramSchemaValidator(
            namecardUnitIdParamsSchema,
            { invalidMessage: '名片组合 ID 无效' },
            normalizeNamecardUnitIdParams
        ),
        querySchemaValidator(
            namecardUnitDeleteQuerySchema,
            { invalidMessage: '删除参数无效' },
            normalizeNamecardUnitDeleteQuery
        ),
        handleDeleteAdminNamecardUnit
    );
}
