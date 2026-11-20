import {
    adminNamecardTagBlockedMatchListSchema,
    adminNamecardTagBlocklistCreateRequestSchema,
    adminNamecardTagBlocklistDeleteSchema,
    adminNamecardTagBlocklistListQuerySchema,
    adminNamecardTagBlocklistListSchema,
    adminNamecardTagBlocklistMutationSchema,
    adminNamecardTagBlocklistParamsSchema,
    adminNamecardTagBlocklistRemoveMatchesSchema,
    adminNamecardTagBlocklistUpdateRequestSchema,
    adminNamecardTagBlockRequestSchema,
    adminNamecardTagBlockResultSchema,
    adminNamecardTagFreeListSchema,
    adminNamecardTagFreeQuerySchema,
    adminNamecardTagPresetCreateRequestSchema,
    adminNamecardTagPresetDeleteSchema,
    adminNamecardTagPresetListQuerySchema,
    adminNamecardTagPresetListSchema,
    adminNamecardTagPresetMergeRequestSchema,
    adminNamecardTagPresetMutationSchema,
    adminNamecardTagPresetParamsSchema,
    adminNamecardTagPresetUpdateRequestSchema,
    adminNamecardTagPromoteRequestSchema,
    adminNamecardTagPromoteResponseSchema,
    type AdminNamecardTagBlockedMatchList,
    type AdminNamecardTagBlocklistDelete,
    type AdminNamecardTagBlocklistList,
    type AdminNamecardTagBlocklistListQuery,
    type AdminNamecardTagBlocklistMutation,
    type AdminNamecardTagBlocklistParams,
    type AdminNamecardTagBlocklistRemoveMatches,
    type AdminNamecardTagBlocklistUpdateRequest,
    type AdminNamecardTagBlockRequest,
    type AdminNamecardTagBlockResult,
    type AdminNamecardTagFreeList,
    type AdminNamecardTagFreeQuery,
    type AdminNamecardTagPresetCreateRequest,
    type AdminNamecardTagPresetDelete,
    type AdminNamecardTagPresetList,
    type AdminNamecardTagPresetListQuery,
    type AdminNamecardTagPresetMergeRequest,
    type AdminNamecardTagPresetMutation,
    type AdminNamecardTagPresetParams,
    type AdminNamecardTagPresetUpdateRequest,
    type AdminNamecardTagPromoteRequest,
    type AdminNamecardTagPromoteResponse,
} from '@imsweb/contracts/namecards';
import { adminApiPath } from '@imsweb/contracts/paths';
import type { Context } from 'hono';
import type { AppEnvironment, ImsHonoApp } from '@/app';
import { namecardTagRepository } from '@/middleware/hono-context';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator,
    type ValidatedRequestContext,
    type ValidatedRequestInput,
} from '@/middleware/request-validation';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

type TagAdminActionContext<Params, Body> = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', Params> &
        ValidatedRequestInput<'json', Body>
>;

const TAGS = adminApiPath('/namecard-tags');

function numberParam(value: string): number {
    return Number(value);
}

async function tagRepositoryResponse<Body>(
    c: Context<AppEnvironment>,
    operation: () => Promise<{ status: number; body: Body }>
): Promise<Response> {
    try {
        const { status, body } = await operation();
        return c.json(body, status as 200 | 201);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Namecard tag admin operation failed', error);
        return c.json(
            {
                success: false,
                code: status === 409 ? 'NAMECARD_TAG_CONFLICT' : 'NAMECARD_TAG_INVALID',
                message: messageFromError(error),
            },
            status as 400 | 404 | 409 | 500
        );
    }
}

export function registerAdminNamecardTagRoutes(app: ImsHonoApp): void {
    app.get(
        `${TAGS}/free`,
        backofficeAuth,
        opOnly,
        querySchemaValidator(adminNamecardTagFreeQuerySchema, {
            invalidMessage: '标签检索条件无效',
        }),
        (c) =>
            handleListFreeTags(
                c as ValidatedRequestContext<
                    AppEnvironment,
                    'query',
                    AdminNamecardTagFreeQuery
                >
            )
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
        (c) =>
            handlePromoteFreeTag(
                c as ValidatedRequestContext<
                    AppEnvironment,
                    'json',
                    AdminNamecardTagPromoteRequest
                >
            )
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
        (c) =>
            handleBlockFreeTag(
                c as ValidatedRequestContext<
                    AppEnvironment,
                    'json',
                    AdminNamecardTagBlockRequest
                >
            )
    );

    app.get(
        `${TAGS}/presets`,
        backofficeAuth,
        opOnly,
        querySchemaValidator(adminNamecardTagPresetListQuerySchema, {
            invalidMessage: '标签检索条件无效',
        }),
        (c) =>
            handleListPresets(
                c as ValidatedRequestContext<
                    AppEnvironment,
                    'query',
                    AdminNamecardTagPresetListQuery
                >
            )
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
        (c) =>
            handleCreatePreset(
                c as ValidatedRequestContext<
                    AppEnvironment,
                    'json',
                    AdminNamecardTagPresetCreateRequest
                >
            )
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
        (c) =>
            handleUpdatePreset(
                c as TagAdminActionContext<
                    AdminNamecardTagPresetParams,
                    AdminNamecardTagPresetUpdateRequest
                >
            )
    );
    app.delete(
        `${TAGS}/presets/:id`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        paramSchemaValidator(adminNamecardTagPresetParamsSchema),
        (c) =>
            handleDeletePreset(
                c as ValidatedRequestContext<
                    AppEnvironment,
                    'param',
                    AdminNamecardTagPresetParams
                >
            )
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
        (c) =>
            handleMergeFreeTag(
                c as TagAdminActionContext<
                    AdminNamecardTagPresetParams,
                    AdminNamecardTagPresetMergeRequest
                >
            )
    );

    app.get(
        `${TAGS}/blocklist`,
        backofficeAuth,
        opOnly,
        querySchemaValidator(adminNamecardTagBlocklistListQuerySchema, {
            invalidMessage: '屏蔽词检索条件无效',
        }),
        (c) =>
            handleListBlocklist(
                c as ValidatedRequestContext<
                    AppEnvironment,
                    'query',
                    AdminNamecardTagBlocklistListQuery
                >
            )
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
        (c) =>
            handleCreateBlocklist(
                c as ValidatedRequestContext<
                    AppEnvironment,
                    'json',
                    { pattern: string; isRegex: boolean }
                >
            )
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
        (c) =>
            handleUpdateBlocklist(
                c as TagAdminActionContext<
                    AdminNamecardTagBlocklistParams,
                    AdminNamecardTagBlocklistUpdateRequest
                >
            )
    );
    app.delete(
        `${TAGS}/blocklist/:id`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        paramSchemaValidator(adminNamecardTagBlocklistParamsSchema),
        (c) =>
            handleDeleteBlocklist(
                c as ValidatedRequestContext<
                    AppEnvironment,
                    'param',
                    AdminNamecardTagBlocklistParams
                >
            )
    );
    app.post(
        `${TAGS}/blocklist/:id/remove-matches`,
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        paramSchemaValidator(adminNamecardTagBlocklistParamsSchema),
        (c) =>
            handleRemoveBlocklistMatches(
                c as ValidatedRequestContext<
                    AppEnvironment,
                    'param',
                    AdminNamecardTagBlocklistParams
                >
            )
    );
}

async function handleListFreeTags(
    c: ValidatedRequestContext<
        AppEnvironment,
        'query',
        AdminNamecardTagFreeQuery
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { q, sort, page, pageSize } = c.req.valid('query');
        const { items, total } = await namecardTagRepository(c).listFree({
            q: q ?? null,
            sort,
            limit: pageSize,
            offset: (page - 1) * pageSize,
        });
        const totalPages = Math.ceil(total / pageSize);
        return {
            status: 200,
            body: {
                success: true,
                items,
                pageInfo: {
                    page,
                    pageSize,
                    total,
                    totalPages,
                    hasNextPage: page < totalPages,
                },
            } satisfies AdminNamecardTagFreeList,
        };
    });
}

async function handlePromoteFreeTag(
    c: ValidatedRequestContext<
        AppEnvironment,
        'json',
        AdminNamecardTagPromoteRequest
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const body = c.req.valid('json');
        const preset = await namecardTagRepository(c).promoteFreeTag({
            name: body.name,
            ...(body.presetName === undefined ? {} : { presetName: body.presetName }),
            aliases: body.aliases,
            now: new Date().toISOString(),
        });
        return {
            status: 201,
            body: { success: true, preset } satisfies AdminNamecardTagPromoteResponse,
        };
    });
}

async function handleBlockFreeTag(
    c: ValidatedRequestContext<
        AppEnvironment,
        'json',
        AdminNamecardTagBlockRequest
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const body = c.req.valid('json');
        const { removed, item } = await namecardTagRepository(c).blockFreeTag({
            name: body.name,
            pattern: body.pattern ?? body.name,
            isRegex: body.isRegex ?? false,
            now: new Date().toISOString(),
        });
        return {
            status: 200,
            body: { success: true, removed, item } satisfies AdminNamecardTagBlockResult,
        };
    });
}

async function handleListPresets(
    c: ValidatedRequestContext<
        AppEnvironment,
        'query',
        AdminNamecardTagPresetListQuery
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { q, page, pageSize } = c.req.valid('query');
        const { items, total } = await namecardTagRepository(c).listPresets({
            q: q ?? null,
            limit: pageSize,
            offset: (page - 1) * pageSize,
        });
        const totalPages = Math.ceil(total / pageSize);
        return {
            status: 200,
            body: {
                success: true,
                items,
                pageInfo: {
                    page,
                    pageSize,
                    total,
                    totalPages,
                    hasNextPage: page < totalPages,
                },
            } satisfies AdminNamecardTagPresetList,
        };
    });
}

async function handleCreatePreset(
    c: ValidatedRequestContext<
        AppEnvironment,
        'json',
        AdminNamecardTagPresetCreateRequest
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const body = c.req.valid('json');
        const preset = await namecardTagRepository(c).createPreset({
            name: body.name,
            aliases: body.aliases,
            now: new Date().toISOString(),
        });
        return {
            status: 201,
            body: { success: true, preset } satisfies AdminNamecardTagPresetMutation,
        };
    });
}

async function handleUpdatePreset(
    c: TagAdminActionContext<
        AdminNamecardTagPresetParams,
        AdminNamecardTagPresetUpdateRequest
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { id } = c.req.valid('param');
        const body = c.req.valid('json');
        const preset = await namecardTagRepository(c).updatePreset({
            id: numberParam(id),
            ...(body.name === undefined ? {} : { name: body.name }),
            ...(body.aliases === undefined ? {} : { aliases: body.aliases }),
            now: new Date().toISOString(),
        });
        return {
            status: 200,
            body: { success: true, preset } satisfies AdminNamecardTagPresetMutation,
        };
    });
}

async function handleDeletePreset(
    c: ValidatedRequestContext<
        AppEnvironment,
        'param',
        AdminNamecardTagPresetParams
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { id } = c.req.valid('param');
        const deleted = await namecardTagRepository(c).deletePreset(numberParam(id));
        if (!deleted) {
            throw Object.assign(new Error('预设标签不存在'), { status: 404 });
        }
        return {
            status: 200,
            body: { success: true, id: numberParam(id) } satisfies AdminNamecardTagPresetDelete,
        };
    });
}

async function handleMergeFreeTag(
    c: TagAdminActionContext<
        AdminNamecardTagPresetParams,
        AdminNamecardTagPresetMergeRequest
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { id } = c.req.valid('param');
        const preset = await namecardTagRepository(c).mergeFreeTag({
            id: numberParam(id),
            name: c.req.valid('json').name,
            now: new Date().toISOString(),
        });
        return {
            status: 200,
            body: { success: true, preset } satisfies AdminNamecardTagPresetMutation,
        };
    });
}

async function handleListBlocklist(
    c: ValidatedRequestContext<
        AppEnvironment,
        'query',
        AdminNamecardTagBlocklistListQuery
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { q, page, pageSize } = c.req.valid('query');
        const { items, total } = await namecardTagRepository(c).listBlocklist({
            q: q ?? null,
            limit: pageSize,
            offset: (page - 1) * pageSize,
        });
        const totalPages = Math.ceil(total / pageSize);
        return {
            status: 200,
            body: {
                success: true,
                items,
                pageInfo: {
                    page,
                    pageSize,
                    total,
                    totalPages,
                    hasNextPage: page < totalPages,
                },
            } satisfies AdminNamecardTagBlocklistList,
        };
    });
}

async function handleCreateBlocklist(
    c: ValidatedRequestContext<
        AppEnvironment,
        'json',
        { pattern: string; isRegex: boolean }
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const body = c.req.valid('json');
        const item = await namecardTagRepository(c).createBlocklist({
            pattern: body.pattern,
            isRegex: body.isRegex,
            now: new Date().toISOString(),
        });
        return {
            status: 201,
            body: { success: true, item } satisfies AdminNamecardTagBlocklistMutation,
        };
    });
}

async function handleUpdateBlocklist(
    c: TagAdminActionContext<
        AdminNamecardTagBlocklistParams,
        AdminNamecardTagBlocklistUpdateRequest
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { id } = c.req.valid('param');
        const body = c.req.valid('json');
        const item = await namecardTagRepository(c).updateBlocklist({
            id: numberParam(id),
            pattern: body.pattern,
            isRegex: body.isRegex,
        });
        if (!item) {
            throw Object.assign(new Error('屏蔽词不存在'), { status: 404 });
        }
        return {
            status: 200,
            body: { success: true, item } satisfies AdminNamecardTagBlocklistMutation,
        };
    });
}

async function handleDeleteBlocklist(
    c: ValidatedRequestContext<
        AppEnvironment,
        'param',
        AdminNamecardTagBlocklistParams
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { id } = c.req.valid('param');
        const deleted = await namecardTagRepository(c).deleteBlocklist(numberParam(id));
        if (!deleted) {
            throw Object.assign(new Error('屏蔽词不存在'), { status: 404 });
        }
        return {
            status: 200,
            body: { success: true, id: numberParam(id) } satisfies AdminNamecardTagBlocklistDelete,
        };
    });
}

async function handleListBlockedMatches(
    c: Context<AppEnvironment>
): Promise<Response> {
    return tagRepositoryResponse(c, async () => ({
        status: 200,
        body: {
            success: true,
            items: await namecardTagRepository(c).listBlockedMatches(),
        } satisfies AdminNamecardTagBlockedMatchList,
    }));
}

async function handleRemoveBlocklistMatches(
    c: ValidatedRequestContext<
        AppEnvironment,
        'param',
        AdminNamecardTagBlocklistParams
    >
): Promise<Response> {
    return tagRepositoryResponse(c, async () => {
        const { id } = c.req.valid('param');
        const removed = await namecardTagRepository(c).removeBlocklistMatches(
            numberParam(id)
        );
        return {
            status: 200,
            body: { success: true, removed } satisfies AdminNamecardTagBlocklistRemoveMatches,
        };
    });
}
