import type { Env } from 'hono';
import type {
    WikiStoryCatalogOptionInput,
    WikiStoryContentTypeInput,
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
} from '@/domains/content/wiki/handler-support';
import { requireWikiServices } from '@/domains/content/wiki/service';
import type {
    WikiIdParams,
    WikiStoryCatalogMutationRequest,
    WikiValidatedInput
} from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';

type CatalogKind = 'content-type' | 'source-platform';
function catalogInput(body: WikiStoryCatalogMutationRequest): WikiStoryCatalogOptionInput {
    return {
        name: body.name,
        description: body.description,
        isActive: body.isActive
    };
}

function contentTypeInput(
    body: WikiStoryCatalogMutationRequest
): WikiStoryContentTypeInput {
    return { ...catalogInput(body), iconName: body.iconName! };
}

function sourcePlatformInput(
    body: WikiStoryCatalogMutationRequest
): WikiStorySourcePlatformInput {
    return { ...catalogInput(body), homepageUrl: body.homepageUrl! };
}

type PublicCatalogOptionRecord = {
    id: number;
    name: string;
    description: string;
    display_order: number;
    is_active: boolean;
    revision: number;
};

function publicCatalogOption(option: PublicCatalogOptionRecord) {
    return {
        id: option.id,
        name: option.name,
        description: option.description,
        displayOrder: option.display_order,
        isActive: option.is_active,
        revision: option.revision
    };
}

function publicContentType(option: PublicCatalogOptionRecord & { icon_name: string }) {
    return {
        ...publicCatalogOption(option),
        iconName: option.icon_name
    };
}

function publicSourcePlatform(option: PublicCatalogOptionRecord & {
    homepage_url: string;
}) {
    return {
        ...publicCatalogOption(option),
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
): WikiRouteHandler<E> {
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
): WikiRouteHandler<E,
    WikiValidatedInput<'json', WikiStoryCatalogMutationRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const body = context.req.valid('json');
            const option = kind === 'content-type'
                ? publicContentType(await services.story!.createStoryContentType(
                    contentTypeInput(body)
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
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiIdParams> &
    WikiValidatedInput<'json', WikiStoryCatalogMutationRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const id = context.req.valid('param').id;
            const body = context.req.valid('json');
            const result = kind === 'content-type'
                ? await services.story!.updateStoryContentType(
                    id,
                    body.expectedRevision!,
                    contentTypeInput(body)
                )
                : await services.story!.updateStorySourcePlatform(
                    id,
                    body.expectedRevision!,
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
): WikiRouteHandler<E, WikiValidatedInput<'param', WikiIdParams>> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const id = context.req.valid('param').id;
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
