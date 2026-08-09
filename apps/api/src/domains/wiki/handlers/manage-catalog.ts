import type { Env } from 'hono';
import type {
    AgencyRecord,
    IdolRecord,
    WikiEntryKind,
    WikiGroupRecord,
    WikiStoryEntrySubtype
} from '@/ports/repositories';
import {
    authorizeWikiWrite,
    cleanupWikiObjects,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    agencyImageTransform,
    groupImageTransform,
    idolImageTransform,
    requireWikiServices,
    wikiGroupIconUrl
} from '@/domains/wiki/service';
import type {
    WikiCatalogMutationRequest,
    WikiIdParams,
    WikiValidatedInput
} from '@/domains/wiki/request';
import type { WikiRouteHandler } from '@/domains/wiki/response';

const SLUG = /^[a-z0-9][a-z0-9_-]*$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const ENTRY_KINDS = new Set<WikiEntryKind>(['idol', 'unit', 'story', 'other']);
const STORY_ENTRY_SUBTYPES = new Set<WikiStoryEntrySubtype>([
    'main', 'event', 'special', 'other'
]);

type JsonObject = Record<string, unknown>;

function revisionValue(body: JsonObject, key = 'expectedRevision'): number {
    const value = body[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw Object.assign(new Error(`${key} 必须是非负整数`), { status: 400 });
    }
    return value;
}

function textValue(
    body: JsonObject,
    key: string,
    label: string,
    fallback?: string
): string {
    const value = body[key] === undefined ? fallback : body[key];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
        throw Object.assign(new Error(`${label}无效`), { status: 400 });
    }
    return value.trim();
}

function slugValue(body: JsonObject, key: string, label: string, fallback?: string): string {
    const value = textValue(body, key, label, fallback).toLowerCase();
    if (!SLUG.test(value)) {
        throw Object.assign(new Error(`${label}只能使用小写字母、数字、下划线和连字符`), {
            status: 400
        });
    }
    return value;
}

function colorValue(
    body: JsonObject,
    key: string,
    label: string,
    fallback: string | null,
    nullable = false
): string | null {
    const value = body[key] === undefined ? fallback : body[key];
    if (nullable && value === null) return null;
    if (typeof value !== 'string' || !COLOR.test(value)) {
        throw Object.assign(new Error(`${label}必须是六位十六进制颜色`), { status: 400 });
    }
    return value.toLowerCase();
}

function booleanValue(body: JsonObject, key: string, fallback: boolean): boolean {
    const value = body[key] === undefined ? fallback : body[key];
    if (typeof value !== 'boolean') {
        throw Object.assign(new Error(`${key} 必须是布尔值`), { status: 400 });
    }
    return value;
}

function optionalHttpUrlValue(
    body: JsonObject,
    key: string,
    fallback: string | null = null
): string | null {
    const value = body[key] === undefined ? fallback : body[key];
    if (value === null) return null;
    if (typeof value !== 'string') {
        throw Object.assign(new Error('Wiki 链接必须是有效的 HTTP 或 HTTPS 地址'), {
            status: 400
        });
    }
    const normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > 2048) {
        throw Object.assign(new Error('Wiki 链接不能超过 2048 个字符'), { status: 400 });
    }
    try {
        const url = new URL(normalized);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
        return url.href;
    } catch {
        throw Object.assign(new Error('Wiki 链接必须是有效的 HTTP 或 HTTPS 地址'), {
            status: 400
        });
    }
}

function groupIdsValue(body: JsonObject): number[] {
    if (!Array.isArray(body.groupIds)) {
        throw Object.assign(new Error('栏目列表必须是数组'), { status: 400 });
    }
    const ids = body.groupIds.map(Number);
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
        new Set(ids).size !== ids.length) {
        throw Object.assign(new Error('栏目列表无效或包含重复项'), { status: 400 });
    }
    return ids;
}

function entryTypeValue(
    body: JsonObject,
    fallbackKind: WikiEntryKind,
    fallbackSubtype: WikiStoryEntrySubtype | null
): { entryKind: WikiEntryKind; entrySubtype: WikiStoryEntrySubtype | null } {
    const rawKind = body.entryKind === undefined ? fallbackKind : body.entryKind;
    if (typeof rawKind !== 'string' || !ENTRY_KINDS.has(rawKind as WikiEntryKind)) {
        throw Object.assign(new Error('内容页类型无效'), { status: 400 });
    }
    const entryKind = rawKind as WikiEntryKind;
    const rawSubtype = body.entrySubtype === undefined
        ? entryKind === fallbackKind ? fallbackSubtype : null
        : body.entrySubtype;
    if (entryKind !== 'story') {
        if (rawSubtype !== null && rawSubtype !== undefined) {
            throw Object.assign(new Error('只有剧情内容页可以设置剧情类型'), { status: 400 });
        }
        return { entryKind, entrySubtype: null };
    }
    if (typeof rawSubtype !== 'string' ||
        !STORY_ENTRY_SUBTYPES.has(rawSubtype as WikiStoryEntrySubtype)) {
        throw Object.assign(new Error('剧情内容页必须选择剧情类型'), { status: 400 });
    }
    return { entryKind, entrySubtype: rawSubtype as WikiStoryEntrySubtype };
}

function imageFitValue(body: JsonObject, fallback: 'cover' | 'contain'): 'cover' | 'contain' {
    const value = body.imageFit === undefined ? fallback : body.imageFit;
    if (value !== 'cover' && value !== 'contain') {
        throw Object.assign(new Error('页面图片适配方式无效'), { status: 400 });
    }
    return value;
}

function agencyResponse(agency: AgencyRecord) {
    return {
        id: agency.id,
        code: agency.code,
        name: agency.name_cn,
        color: agency.color,
        wikiEnabled: agency.wiki_enabled,
        bannerTitle: agency.banner_title,
        displayOrder: agency.display_order,
        layoutRevision: agency.layout_revision,
        iconUrl: agency.icon_object_key ? `/icon/agencies/${agency.id}.webp` : null,
        imageTransform: agencyImageTransform(agency),
        mediaRevision: agency.icon_media_revision
    };
}

function groupResponse(group: WikiGroupRecord) {
    return {
        id: group.id,
        agencyId: group.agency_id,
        code: group.code,
        name: group.name,
        color: group.color,
        displayOrder: group.display_order,
        isFallback: group.is_fallback,
        iconUrl: group.icon_object_key ? wikiGroupIconUrl(group.id) : null,
        imageTransform: groupImageTransform(group),
        mediaRevision: group.icon_media_revision
    };
}

function idolResponse(idol: IdolRecord, groupIds: number[]) {
    return {
        id: idol.id,
        agencyId: idol.agency_id,
        name: idol.name_cn,
        folderName: idol.folder_name,
        color: idol.color,
        wikiUrl: idol.wiki_url,
        wikiEnabled: idol.wiki_enabled,
        displayOrder: idol.display_order,
        textColor: idol.text_color,
        imageFit: idol.avatar_fit,
        groupIds,
        imageUrl: '',
        imageTransform: idolImageTransform(idol),
        mediaRevision: idol.avatar_media_revision,
        entryKind: idol.entry_kind,
        entrySubtype: idol.entry_subtype
    };
}

function catalogError(error: unknown, fallback: string): Response {
    const duplicate = error instanceof Error && /unique|duplicate/i.test(error.message);
    return wikiJson(
        wikiErrorBody(wikiMessageOf(error, fallback)),
        duplicate ? 409 : error instanceof SyntaxError ? 400 : wikiStatusOf(error)
    );
}

export function createHandleCreateWikiAgency<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E, WikiValidatedInput<'json', WikiCatalogMutationRequest>> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const body = context.req.valid('json');
            const name = textValue(body, 'name', '企划名称');
            const agency = await services.story!.createWikiAgency({
                code: slugValue(body, 'code', '企划代码'),
                name,
                color: colorValue(body, 'color', '企划颜色', null)!,
                bannerTitle: textValue(body, 'bannerTitle', '横幅标题', name),
                wikiEnabled: booleanValue(body, 'wikiEnabled', true)
            });
            return wikiJson({ status: 'success', agency: agencyResponse(agency) }, 201);
        } catch (error) {
            return catalogError(error, '新增企划失败');
        }
    };
}

export function createHandleUpdateWikiAgency<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiIdParams> &
    WikiValidatedInput<'json', WikiCatalogMutationRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const id = context.req.valid('param').id;
            const existing = await services.story!.findAgencyById(id);
            if (!existing) throw Object.assign(new Error('企划不存在'), { status: 404 });
            const body = context.req.valid('json');
            const agency = await services.story!.updateWikiAgency({
                id,
                name: textValue(body, 'name', '企划名称', existing.name_cn),
                color: colorValue(body, 'color', '企划颜色', existing.color)!,
                bannerTitle: textValue(
                    body, 'bannerTitle', '横幅标题', existing.banner_title || existing.name_cn
                ),
                wikiEnabled: booleanValue(body, 'wikiEnabled', existing.wiki_enabled)
            });
            return wikiJson({ status: 'success', agency: agencyResponse(agency) });
        } catch (error) {
            return catalogError(error, '编辑企划失败');
        }
    };
}

export function createHandleCreateWikiGroup<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiIdParams> &
    WikiValidatedInput<'json', WikiCatalogMutationRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const agencyId = context.req.valid('param').id;
            const body = context.req.valid('json');
            const group = await services.story!.createWikiGroup({
                agencyId,
                code: slugValue(body, 'code', '栏目代码'),
                name: textValue(body, 'name', '栏目名称'),
                color: colorValue(body, 'color', '栏目颜色', null)!
            });
            return wikiJson({ status: 'success', group: groupResponse(group) }, 201);
        } catch (error) {
            return catalogError(error, '新增栏目失败');
        }
    };
}

export function createHandleUpdateWikiGroup<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiIdParams> &
    WikiValidatedInput<'json', WikiCatalogMutationRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const id = context.req.valid('param').id;
            const existing = await services.story!.findWikiGroupById(id);
            if (!existing) throw Object.assign(new Error('栏目不存在'), { status: 404 });
            const body = context.req.valid('json');
            const group = await services.story!.updateWikiGroup({
                id,
                code: slugValue(body, 'code', '栏目代码', existing.code),
                name: textValue(body, 'name', '栏目名称', existing.name),
                color: colorValue(body, 'color', '栏目颜色', existing.color)!
            });
            return wikiJson({ status: 'success', group: groupResponse(group) });
        } catch (error) {
            return catalogError(error, '编辑栏目失败');
        }
    };
}

export function createHandleDeleteWikiGroup<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiIdParams> &
    WikiValidatedInput<'json', WikiCatalogMutationRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage']);
        try {
            const id = context.req.valid('param').id;
            const body = context.req.valid('json');
            const result = await services.story!.deleteWikiGroup({
                id,
                expectedRevision: revisionValue(body)
            });
            if (!result) throw Object.assign(new Error('栏目不存在'), { status: 404 });
            if (result.status === 'conflict') {
                return wikiJson({
                    ...wikiErrorBody('栏目图标已被其他编辑更新，请刷新后重试'),
                    iconMediaRevision: result.revision
                }, 409);
            }
            if (result.group.icon_object_key) {
                await cleanupWikiObjects(services, [result.group.icon_object_key]);
            }
            return wikiJson({ status: 'success' });
        } catch (error) {
            return catalogError(error, '删除栏目失败');
        }
    };
}

export function createHandleCreateWikiIdol<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiIdParams> &
    WikiValidatedInput<'json', WikiCatalogMutationRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const agencyId = context.req.valid('param').id;
            const body = context.req.valid('json');
            const groupIds = groupIdsValue(body);
            const entryType = entryTypeValue(body, 'idol', null);
            const idol = await services.story!.createWikiIdol({
                agencyId,
                name: textValue(body, 'name', '内容页名称'),
                folderName: slugValue(body, 'folderName', '目录标识'),
                color: colorValue(body, 'color', '内容页颜色', null, true),
                textColor: colorValue(body, 'textColor', '文字颜色', '#ffffff')!,
                wikiUrl: optionalHttpUrlValue(body, 'wikiUrl'),
                imageFit: imageFitValue(body, 'cover'),
                wikiEnabled: booleanValue(body, 'wikiEnabled', true),
                groupIds,
                ...entryType
            });
            return wikiJson({ status: 'success', idol: idolResponse(idol, groupIds) }, 201);
        } catch (error) {
            return catalogError(error, '新增内容页失败');
        }
    };
}

export function createHandleUpdateWikiIdol<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiIdParams> &
    WikiValidatedInput<'json', WikiCatalogMutationRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const id = context.req.valid('param').id;
            const existing = await services.story!.findIdolById(id);
            if (!existing) throw Object.assign(new Error('内容页不存在'), { status: 404 });
            const body = context.req.valid('json');
            const groupIds = groupIdsValue(body);
            const entryType = entryTypeValue(
                body, existing.entry_kind, existing.entry_subtype
            );
            const idol = await services.story!.updateWikiIdol({
                id,
                name: textValue(body, 'name', '内容页名称', existing.name_cn),
                color: colorValue(body, 'color', '内容页颜色', existing.color, true),
                textColor: colorValue(body, 'textColor', '文字颜色', existing.text_color)!,
                wikiUrl: optionalHttpUrlValue(body, 'wikiUrl', existing.wiki_url),
                imageFit: imageFitValue(body, existing.avatar_fit),
                wikiEnabled: booleanValue(body, 'wikiEnabled', existing.wiki_enabled),
                groupIds,
                ...entryType
            });
            return wikiJson({ status: 'success', idol: idolResponse(idol, groupIds) });
        } catch (error) {
            return catalogError(error, '编辑内容页失败');
        }
    };
}

export function createHandleDeleteWikiIdol<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiIdParams> &
    WikiValidatedInput<'json', WikiCatalogMutationRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const id = context.req.valid('param').id;
            const body = context.req.valid('json');
            const result = await services.story!.deleteWikiIdol({
                id,
                expectedRevision: revisionValue(body)
            });
            if (!result) throw Object.assign(new Error('内容页不存在'), { status: 404 });
            if (result.status === 'conflict') {
                return wikiJson({
                    ...wikiErrorBody('内容页图片已被其他编辑更新，请刷新后重试'),
                    avatarMediaRevision: result.revision
                }, 409);
            }
            return wikiJson({
                status: 'success',
                softDeleted: {
                    cards: result.cardCount,
                    stories: result.storyCount
                }
            });
        } catch (error) {
            return catalogError(error, '删除内容页失败');
        }
    };
}
