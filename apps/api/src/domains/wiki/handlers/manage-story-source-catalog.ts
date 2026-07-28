import type { Env, Handler } from 'hono';
import type {
    WikiStoryCatalogOptionInput,
    WikiStorySourcePlatformInput
} from '@/ports/repositories';
import {
    authorizeWikiRead,
    authorizeWikiWrite,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { requireWikiServices } from '@/domains/wiki/service';

type CatalogKind = 'content-type' | 'source-platform';
type JsonObject = Record<string, unknown>;

function positiveId(value: string | undefined): number {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw Object.assign(new Error('目录项 ID 无效'), { status: 400 });
    }
    return id;
}

function requiredText(value: unknown, label: string, maximumLength: number): string {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > maximumLength) {
        throw Object.assign(new Error(`${label}无效`), { status: 400 });
    }
    return value.trim();
}

function optionalText(value: unknown, label: string, maximumLength: number): string {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string' || value.trim().length > maximumLength) {
        throw Object.assign(new Error(`${label}无效`), { status: 400 });
    }
    return value.trim();
}

function activeValue(value: unknown): boolean {
    if (value === undefined) return true;
    if (typeof value !== 'boolean') {
        throw Object.assign(new Error('启用状态无效'), { status: 400 });
    }
    return value;
}

function expectedRevision(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw Object.assign(new Error('expectedRevision 必须是非负整数'), { status: 400 });
    }
    return value;
}

function catalogInput(body: JsonObject): WikiStoryCatalogOptionInput {
    return {
        name: requiredText(body.name, '名称', 80),
        description: optionalText(body.description, '说明', 240),
        isActive: activeValue(body.isActive)
    };
}

function sourcePlatformInput(body: JsonObject): WikiStorySourcePlatformInput {
    const homepageUrl = optionalText(body.homepageUrl, '主页链接', 2048);
    if (homepageUrl) {
        let parsed: URL;
        try {
            parsed = new URL(homepageUrl);
        } catch {
            throw Object.assign(new Error('主页链接无效'), { status: 400 });
        }
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw Object.assign(new Error('主页链接仅支持 HTTP 或 HTTPS'), { status: 400 });
        }
    }
    return { ...catalogInput(body), homepageUrl };
}

function publicContentType(option: {
    id: number;
    name: string;
    description: string;
    display_order: number;
    is_active: boolean;
    revision: number;
}) {
    return {
        id: option.id,
        name: option.name,
        description: option.description,
        displayOrder: option.display_order,
        isActive: option.is_active,
        revision: option.revision
    };
}

function publicSourcePlatform(option: {
    id: number;
    name: string;
    homepage_url: string;
    description: string;
    display_order: number;
    is_active: boolean;
    revision: number;
}) {
    return {
        ...publicContentType(option),
        homepageUrl: option.homepage_url
    };
}

function mutationError(error: unknown): Response {
    const message = wikiMessageOf(error, '来源目录保存失败');
    const duplicate = /unique|duplicate/i.test(message);
    return wikiJson(
        wikiErrorBody(duplicate ? '名称已存在' : message),
        duplicate ? 409 : wikiStatusOf(error)
    );
}

export function createHandleListWikiStorySourceCatalog<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiRead(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        const [contentTypes, sourcePlatforms] = await Promise.all([
            services.story!.listStoryContentTypes(),
            services.story!.listStorySourcePlatforms()
        ]);
        return wikiJson({
            status: 'success',
            contentTypes: contentTypes.map(publicContentType),
            sourcePlatforms: sourcePlatforms.map(publicSourcePlatform)
        });
    };
}

export function createHandleCreateWikiStoryCatalogOption<E extends Env>(
    resolveServices: WikiServicesResolver<E>,
    kind: CatalogKind
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const body = await context.req.json<JsonObject>();
            const option = kind === 'content-type'
                ? publicContentType(await services.story!.createStoryContentType(
                    catalogInput(body)
                ))
                : publicSourcePlatform(await services.story!.createStorySourcePlatform(
                    sourcePlatformInput(body)
                ));
            return wikiJson({ status: 'success', option }, 201);
        } catch (error) {
            return error instanceof SyntaxError
                ? wikiJson(wikiErrorBody('请求内容不是有效 JSON'), 400)
                : mutationError(error);
        }
    };
}

export function createHandleUpdateWikiStoryCatalogOption<E extends Env>(
    resolveServices: WikiServicesResolver<E>,
    kind: CatalogKind
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const id = positiveId(context.req.param('optionId'));
            const body = await context.req.json<JsonObject>();
            const result = kind === 'content-type'
                ? await services.story!.updateStoryContentType(
                    id,
                    expectedRevision(body.expectedRevision),
                    catalogInput(body)
                )
                : await services.story!.updateStorySourcePlatform(
                    id,
                    expectedRevision(body.expectedRevision),
                    sourcePlatformInput(body)
                );
            if (!result) return wikiJson(wikiErrorBody('目录项不存在'), 404);
            if (result.status === 'conflict') {
                return wikiJson({
                    ...wikiErrorBody('目录项已被其他编辑更新，请刷新后重试'),
                    revision: result.revision
                }, 409);
            }
            return wikiJson({
                status: 'success',
                option: kind === 'content-type'
                    ? publicContentType(result.option as Parameters<typeof publicContentType>[0])
                    : publicSourcePlatform(
                        result.option as Parameters<typeof publicSourcePlatform>[0]
                    )
            });
        } catch (error) {
            return error instanceof SyntaxError
                ? wikiJson(wikiErrorBody('请求内容不是有效 JSON'), 400)
                : mutationError(error);
        }
    };
}

export function createHandleDeleteWikiStoryCatalogOption<E extends Env>(
    resolveServices: WikiServicesResolver<E>,
    kind: CatalogKind
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const id = positiveId(context.req.param('optionId'));
            const result = kind === 'content-type'
                ? await services.story!.deleteStoryContentType(id)
                : await services.story!.deleteStorySourcePlatform(id);
            if (result.status === 'not-found') {
                return wikiJson(wikiErrorBody('目录项不存在'), 404);
            }
            if (result.status === 'in-use') {
                return wikiJson(wikiErrorBody('目录项仍被来源引用，请先停用或迁移来源'), 409);
            }
            return wikiJson({ status: 'success' });
        } catch (error) {
            return mutationError(error);
        }
    };
}
