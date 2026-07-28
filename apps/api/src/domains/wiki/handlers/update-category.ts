import type { Env, Handler } from 'hono';
import {
    authorizeWikiWrite,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { categoryStorageSlug, requireWikiServices } from '@/domains/wiki/service';

type JsonObject = Record<string, unknown>;

function positiveId(value: string | undefined, label: string): number {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw Object.assign(new Error(`${label} ID 无效`), { status: 400 });
    }
    return id;
}

function requiredText(body: JsonObject, key: string, label: string): string {
    const value = body[key];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
        throw Object.assign(new Error(`${label}无效`), { status: 400 });
    }
    return value.trim();
}

function categoryResponse(category: {
    id: number;
    name: string;
    storage_slug: string;
    display_order: number;
    show_when_empty: boolean;
    background_eligible: boolean;
}) {
    return {
        id: category.id,
        name: category.name,
        storageSlug: category.storage_slug,
        displayOrder: category.display_order,
        showWhenEmpty: category.show_when_empty,
        backgroundEligible: category.background_eligible
    };
}

export function createHandleCreateWikiCategory<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const agencyId = positiveId(context.req.param('agencyId'), '企划');
            const idolId = positiveId(context.req.param('idolId'), '内容页');
            const body = await context.req.json<JsonObject>();
            const name = requiredText(body, 'name', '分类名称');
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
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const categoryId = positiveId(context.req.param('categoryId'), '分类');
            const body = await context.req.json<JsonObject>();
            const agencyId = positiveId(String(body.agencyId ?? ''), '企划');
            const idolId = positiveId(String(body.idolId ?? ''), '内容页');
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
                name: requiredText(body, 'name', '分类名称'),
                expectedName: requiredText(body, 'expectedName', '当前分类名称')
            });
            if (!category) {
                throw Object.assign(new Error('分类不属于所选内容页'), { status: 404 });
            }
            if (category.status === 'conflict') {
                return wikiJson({
                    ...wikiErrorBody('分类已被其他编辑更新，请刷新后重试'),
                    currentName: category.currentName
                }, 409);
            }
            const saved = category.category;
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
