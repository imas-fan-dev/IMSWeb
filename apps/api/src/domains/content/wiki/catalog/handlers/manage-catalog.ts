import type { Env } from 'hono';
import type {
    AgencyRecord,
    IdolRecord,
    WikiGroupRecord
} from '@/ports/repositories';
import {
    authorizeWikiWrite,
    cleanupWikiObjects,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/content/wiki/handler-support';
import {
    agencyImageTransform,
    groupImageTransform,
    idolImageTransform,
    requireWikiServices,
    wikiGroupIconUrl
} from '@/domains/content/wiki/service';
import type {
    CreateWikiAgencyRequest,
    CreateWikiGroupRequest,
    CreateWikiIdolRequest,
    UpdateWikiAgencyRequest,
    UpdateWikiGroupRequest,
    UpdateWikiIdolRequest,
    WikiIdParams,
    WikiRevisionRequest,
    WikiValidatedInput
} from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';

function updatedEntryType(body: UpdateWikiIdolRequest, existing: IdolRecord) {
    const entryKind = body.entryKind ?? existing.entry_kind;
    const entrySubtype = body.entrySubtype === undefined
        ? entryKind === existing.entry_kind ? existing.entry_subtype : null
        : body.entrySubtype;
    if (entryKind !== 'story') {
        if (entrySubtype !== null) {
            throw Object.assign(new Error('只有剧情内容页可以设置剧情类型'), {
                status: 400
            });
        }
        return { entryKind, entrySubtype: null };
    }
    if (entrySubtype === null) {
        throw Object.assign(new Error('剧情内容页必须选择剧情类型'), { status: 400 });
    }
    return { entryKind, entrySubtype };
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
): WikiRouteHandler<E, WikiValidatedInput<'json', CreateWikiAgencyRequest>> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const body = context.req.valid('json');
            const agency = await services.story!.createWikiAgency(body);
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
    WikiValidatedInput<'json', UpdateWikiAgencyRequest>
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
                name: body.name ?? existing.name_cn,
                color: body.color ?? existing.color,
                bannerTitle: body.bannerTitle ?? (existing.banner_title || existing.name_cn),
                wikiEnabled: body.wikiEnabled ?? existing.wiki_enabled
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
    WikiValidatedInput<'json', CreateWikiGroupRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const agencyId = context.req.valid('param').id;
            const body = context.req.valid('json');
            const group = await services.story!.createWikiGroup({ agencyId, ...body });
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
    WikiValidatedInput<'json', UpdateWikiGroupRequest>
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
                code: body.code ?? existing.code,
                name: body.name ?? existing.name,
                color: body.color ?? existing.color
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
    WikiValidatedInput<'json', WikiRevisionRequest>
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
                expectedRevision: body.expectedRevision
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
    WikiValidatedInput<'json', CreateWikiIdolRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const agencyId = context.req.valid('param').id;
            const body = context.req.valid('json');
            const idol = await services.story!.createWikiIdol({
                agencyId,
                ...body
            });
            return wikiJson({ status: 'success', idol: idolResponse(idol, body.groupIds) }, 201);
        } catch (error) {
            return catalogError(error, '新增内容页失败');
        }
    };
}

export function createHandleUpdateWikiIdol<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiIdParams> &
    WikiValidatedInput<'json', UpdateWikiIdolRequest>
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
            const entryType = updatedEntryType(body, existing);
            const idol = await services.story!.updateWikiIdol({
                id,
                name: body.name ?? existing.name_cn,
                color: body.color === undefined ? existing.color : body.color,
                textColor: body.textColor ?? existing.text_color,
                wikiUrl: body.wikiUrl === undefined ? existing.wiki_url : body.wikiUrl,
                imageFit: body.imageFit ?? existing.avatar_fit,
                wikiEnabled: body.wikiEnabled ?? existing.wiki_enabled,
                groupIds: body.groupIds,
                ...entryType
            });
            return wikiJson({
                status: 'success',
                idol: idolResponse(idol, body.groupIds)
            });
        } catch (error) {
            return catalogError(error, '编辑内容页失败');
        }
    };
}

export function createHandleDeleteWikiIdol<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiIdParams> &
    WikiValidatedInput<'json', WikiRevisionRequest>
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
                expectedRevision: body.expectedRevision
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
