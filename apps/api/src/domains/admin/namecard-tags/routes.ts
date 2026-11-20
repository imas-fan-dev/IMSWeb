import {
    adminNamecardTagBlockRequestSchema,
    adminNamecardTagBlocklistCreateRequestSchema,
    adminNamecardTagBlocklistListQuerySchema,
    adminNamecardTagBlocklistParamsSchema,
    adminNamecardTagBlocklistUpdateRequestSchema,
    adminNamecardTagFreeQuerySchema,
    adminNamecardTagPresetCreateRequestSchema,
    adminNamecardTagPresetListQuerySchema,
    adminNamecardTagPresetMergeRequestSchema,
    adminNamecardTagPresetParamsSchema,
    adminNamecardTagPresetUpdateRequestSchema,
    adminNamecardTagPromoteRequestSchema,
} from '@imsweb/contracts/namecards';
import { adminApiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleBlockFreeTag } from '@/domains/admin/namecard-tags/handlers/block-free';
import { handleCreateBlocklist } from '@/domains/admin/namecard-tags/handlers/create-blocklist';
import { handleCreatePreset } from '@/domains/admin/namecard-tags/handlers/create-preset';
import { handleDeleteBlocklist } from '@/domains/admin/namecard-tags/handlers/delete-blocklist';
import { handleDeletePreset } from '@/domains/admin/namecard-tags/handlers/delete-preset';
import { handleListBlockedMatches } from '@/domains/admin/namecard-tags/handlers/list-blocked-matches';
import { handleListBlocklist } from '@/domains/admin/namecard-tags/handlers/list-blocklist';
import { handleListFreeTags } from '@/domains/admin/namecard-tags/handlers/list-free';
import { handleListPresets } from '@/domains/admin/namecard-tags/handlers/list-presets';
import { handleMergeFreeTag } from '@/domains/admin/namecard-tags/handlers/merge-preset';
import { handlePromoteFreeTag } from '@/domains/admin/namecard-tags/handlers/promote-free';
import { handleRemoveBlocklistMatches } from '@/domains/admin/namecard-tags/handlers/remove-blocklist-matches';
import { handleUpdateBlocklist } from '@/domains/admin/namecard-tags/handlers/update-blocklist';
import { handleUpdatePreset } from '@/domains/admin/namecard-tags/handlers/update-preset';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator,
} from '@/middleware/request-validation';

const TAGS = adminApiPath('/namecard-tags');

export function registerAdminNamecardTagRoutes(app: ImsHonoApp): void {
    app.get(
        `${TAGS}/free`,
        backofficeAuth,
        opOnly,
        querySchemaValidator(adminNamecardTagFreeQuerySchema, {
            invalidMessage: '标签检索条件无效',
        }),
        handleListFreeTags
    );
    app.post(
        `${TAGS}/free/promote`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonSchemaValidator(adminNamecardTagPromoteRequestSchema, {
            malformedMessage: '请求正文必须为 JSON',
            invalidMessage: '标签参数无效',
        }),
        handlePromoteFreeTag
    );
    app.post(
        `${TAGS}/free/block`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonSchemaValidator(adminNamecardTagBlockRequestSchema, {
            malformedMessage: '请求正文必须为 JSON',
            invalidMessage: '标签参数无效',
        }),
        handleBlockFreeTag
    );

    app.get(
        `${TAGS}/presets`,
        backofficeAuth,
        opOnly,
        querySchemaValidator(adminNamecardTagPresetListQuerySchema, {
            invalidMessage: '标签检索条件无效',
        }),
        handleListPresets
    );
    app.post(
        `${TAGS}/presets`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonSchemaValidator(adminNamecardTagPresetCreateRequestSchema, {
            malformedMessage: '请求正文必须为 JSON',
            invalidMessage: '预设标签参数无效',
        }),
        handleCreatePreset
    );
    app.patch(
        `${TAGS}/presets/:id`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        paramSchemaValidator(adminNamecardTagPresetParamsSchema),
        jsonSchemaValidator(adminNamecardTagPresetUpdateRequestSchema, {
            malformedMessage: '请求正文必须为 JSON',
            invalidMessage: '预设标签参数无效',
        }),
        handleUpdatePreset
    );
    app.delete(
        `${TAGS}/presets/:id`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        paramSchemaValidator(adminNamecardTagPresetParamsSchema),
        handleDeletePreset
    );
    app.post(
        `${TAGS}/presets/:id/merge`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        paramSchemaValidator(adminNamecardTagPresetParamsSchema),
        jsonSchemaValidator(adminNamecardTagPresetMergeRequestSchema, {
            malformedMessage: '请求正文必须为 JSON',
            invalidMessage: '别名参数无效',
        }),
        handleMergeFreeTag
    );

    app.get(
        `${TAGS}/blocklist`,
        backofficeAuth,
        opOnly,
        querySchemaValidator(adminNamecardTagBlocklistListQuerySchema, {
            invalidMessage: '屏蔽词检索条件无效',
        }),
        handleListBlocklist
    );
    app.get(
        `${TAGS}/blocklist/matches`,
        backofficeAuth,
        opOnly,
        handleListBlockedMatches
    );
    app.post(
        `${TAGS}/blocklist`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonSchemaValidator(adminNamecardTagBlocklistCreateRequestSchema, {
            malformedMessage: '请求正文必须为 JSON',
            invalidMessage: '屏蔽词参数无效',
        }),
        handleCreateBlocklist
    );
    app.patch(
        `${TAGS}/blocklist/:id`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        paramSchemaValidator(adminNamecardTagBlocklistParamsSchema),
        jsonSchemaValidator(adminNamecardTagBlocklistUpdateRequestSchema, {
            malformedMessage: '请求正文必须为 JSON',
            invalidMessage: '屏蔽词参数无效',
        }),
        handleUpdateBlocklist
    );
    app.delete(
        `${TAGS}/blocklist/:id`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        paramSchemaValidator(adminNamecardTagBlocklistParamsSchema),
        handleDeleteBlocklist
    );
    app.post(
        `${TAGS}/blocklist/:id/remove-matches`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        paramSchemaValidator(adminNamecardTagBlocklistParamsSchema),
        handleRemoveBlocklistMatches
    );
}
