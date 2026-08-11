import type { Env } from 'hono';
import {
    authorizeWikiWrite,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    writeWikiAudit,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { categoryStorageSlug, requireWikiServices } from '@/domains/wiki/service';
import type {
    CreateWikiCategoryRequest,
    UpdateWikiCategoryRequest,
    WikiCategoryCreateParams,
    WikiIdParams,
    WikiValidatedInput
} from '@/domains/wiki/request';
import type { WikiRouteHandler } from '@/domains/wiki/response';

function categoryResponse(category: {
    id: number;
    name: string;
    storage_slug: string;
    display_order: number;
    show_when_empty: boolean;
    background_eligible: boolean;
    revision: number;
}) {
    return {
        id: category.id,
        name: category.name,
        storageSlug: category.storage_slug,
        displayOrder: category.display_order,
        showWhenEmpty: category.show_when_empty,
        backgroundEligible: category.background_eligible,
        revision: category.revision
    };
}

export function createHandleCreateWikiCategory<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiCategoryCreateParams> &
    WikiValidatedInput<'json', CreateWikiCategoryRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const { agencyId, idolId } = context.req.valid('param');
            const body = context.req.valid('json');
            const name = body.name;
            const agency = await services.story!.findAgencyById(agencyId);
            const idol = await services.story!.findIdolById(idolId);
            if (!agency) throw Object.assign(new Error('企划不存在'), { status: 404 });
            if (!idol || idol.agency_id !== agency.id) {
                throw Object.assign(new Error('内容页不属于所选企划'), { status: 404 });
            }
            const assigned = await services.story!.listWikiCategories(agencyId, idolId);
            if (assigned.some((category) => category.name === name)) {
                throw Object.assign(new Error('该内容页已包含同名分类'), { status: 409 });
            }
            const category = await services.story!.ensureWikiCategory(
                agencyId,
                idolId,
                name,
                categoryStorageSlug(name)
            );
            await writeWikiAudit(
                context,
                services,
                '新增 Wiki 分类',
                `agency_id=${agencyId};idol_id=${idolId};category_id=${category.id}`
            );
            return wikiJson({
                status: 'success',
                category: categoryResponse(category)
            }, 201);
        } catch (error) {
            const duplicate = error instanceof Error && /unique|duplicate/i.test(error.message);
            return wikiJson(
                wikiErrorBody(duplicate
                    ? '该企划下已存在同名分类'
                    : wikiMessageOf(error, '新增分类失败')),
                duplicate ? 409 : error instanceof SyntaxError ? 400 : wikiStatusOf(error)
            );
        }
    };
}

export function createHandleUpdateWikiCategory<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiIdParams> &
    WikiValidatedInput<'json', UpdateWikiCategoryRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const categoryId = context.req.valid('param').id;
            const body = context.req.valid('json');
            const { agencyId, idolId } = body;
            const agency = await services.story!.findAgencyById(agencyId);
            const idol = await services.story!.findIdolById(idolId);
            if (!agency) throw Object.assign(new Error('企划不存在'), { status: 404 });
            if (!idol || idol.agency_id !== agency.id) {
                throw Object.assign(new Error('内容页不属于所选企划'), { status: 404 });
            }
            const category = await services.story!.updateWikiCategory({
                agencyId,
                idolId,
                id: categoryId,
                name: body.name,
                expectedName: body.expectedName
            });
            if (!category) {
                throw Object.assign(new Error('分类不属于所选内容页'), { status: 404 });
            }
            if (category.status === 'conflict') {
                return wikiJson({
                    ...wikiErrorBody('分类已被其他编辑更新，请刷新后重试'),
                    currentName: category.currentName,
                    revision: category.revision
                }, 409);
            }
            const saved = category.category;
            await writeWikiAudit(
                context,
                services,
                '更新 Wiki 分类',
                `agency_id=${agencyId};idol_id=${idolId};category_id=${saved.id};revision=${saved.revision}`
            );
            return wikiJson({
                status: 'success',
                category: categoryResponse(saved)
            });
        } catch (error) {
            const duplicate = error instanceof Error && /unique|duplicate/i.test(error.message);
            return wikiJson(
                wikiErrorBody(duplicate
                    ? '该企划下已存在同名分类'
                    : wikiMessageOf(error, '编辑分类失败')),
                duplicate ? 409 : error instanceof SyntaxError ? 400 : wikiStatusOf(error)
            );
        }
    };
}
