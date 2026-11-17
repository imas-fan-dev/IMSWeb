import {
    namecardCharacterCreateRequestSchema,
    namecardCharacterDeleteQuerySchema,
    namecardCharacterIdParamsSchema,
    namecardCharacterListQuerySchema,
    namecardCharacterUpdateRequestSchema
} from '@imsweb/contracts/fudaba/admin-characters';
import { adminApiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleCreateAdminNamecardCharacter } from '@/domains/admin/namecard-characters/handlers/create-character';
import { handleDeleteAdminNamecardCharacter } from '@/domains/admin/namecard-characters/handlers/delete-character';
import { handleListAdminNamecardCharacterAgencies } from '@/domains/admin/namecard-characters/handlers/list-agencies';
import { handleListAdminNamecardCharacters } from '@/domains/admin/namecard-characters/handlers/list-characters';
import { handleUpdateAdminNamecardCharacter } from '@/domains/admin/namecard-characters/handlers/update-character';
import {
    normalizeNamecardCharacterCreateRequest,
    normalizeNamecardCharacterDeleteQuery,
    normalizeNamecardCharacterIdParams,
    normalizeNamecardCharacterListQuery,
    normalizeNamecardCharacterUpdateRequest
} from '@/domains/admin/namecard-characters/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator
} from '@/middleware/request-validation';

const CHARACTERS = adminApiPath('/cards/characters');
const CHARACTERS_AGENCIES = adminApiPath('/cards/characters/agencies');
const CHARACTER = adminApiPath('/cards/characters/:id');

export function registerAdminNamecardCharacterRoutes(app: ImsHonoApp): void {
    app.get(
        CHARACTERS,
        backofficeAuth,
        opOnly,
        querySchemaValidator(
            namecardCharacterListQuerySchema,
            { invalidMessage: '检索条件无效' },
            normalizeNamecardCharacterListQuery
        ),
        handleListAdminNamecardCharacters
    );
    app.get(
        CHARACTERS_AGENCIES,
        backofficeAuth,
        opOnly,
        handleListAdminNamecardCharacterAgencies
    );
    app.post(
        CHARACTERS,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonSchemaValidator(
            namecardCharacterCreateRequestSchema,
            {
                malformedMessage: '请求正文必须为 JSON',
                invalidMessage: '名片角色参数无效'
            },
            normalizeNamecardCharacterCreateRequest
        ),
        handleCreateAdminNamecardCharacter
    );
    app.patch(
        CHARACTER,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        paramSchemaValidator(
            namecardCharacterIdParamsSchema,
            { invalidMessage: '名片角色 ID 无效' },
            normalizeNamecardCharacterIdParams
        ),
        jsonSchemaValidator(
            namecardCharacterUpdateRequestSchema,
            {
                malformedMessage: '请求正文必须为 JSON',
                invalidMessage: '名片角色参数无效'
            },
            normalizeNamecardCharacterUpdateRequest
        ),
        handleUpdateAdminNamecardCharacter
    );
    app.delete(
        CHARACTER,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        paramSchemaValidator(
            namecardCharacterIdParamsSchema,
            { invalidMessage: '名片角色 ID 无效' },
            normalizeNamecardCharacterIdParams
        ),
        querySchemaValidator(
            namecardCharacterDeleteQuerySchema,
            { invalidMessage: '删除参数无效' },
            normalizeNamecardCharacterDeleteQuery
        ),
        handleDeleteAdminNamecardCharacter
    );
}
