import type { Env } from 'hono';
import {
    authorizeWikiWrite,
    cleanupWikiObjects,
    findWikiMutationTarget,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    requireWikiServices,
    storyObjectKey
} from '@/domains/wiki/service';
import {
    parseDeleteWikiStoryLinkRequest,
    type WikiIdParams,
    type WikiStoryLinkQuery,
    type WikiValidatedInput
} from '@/domains/wiki/request';
import type { WikiRouteHandler } from '@/domains/wiki/response';

export function createHandleDeleteWikiStoryLink<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiIdParams> &
    WikiValidatedInput<'query', WikiStoryLinkQuery>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage']);
        try {
            const storyId = context.req.valid('param').id;
            const query = context.req.valid('query');
            const body = await parseDeleteWikiStoryLinkRequest(context.req.raw, query);
            const target = await findWikiMutationTarget(
                services,
                body.agency,
                body.idol,
                404
            );
            if ('error' in target) return target.error;
            const result = await services.story!.deleteStoryLink({
                agencyCode: target.agency.code,
                idolId: target.idol.id,
                id: storyId,
                expectedRevision: body.expectedRevision
            });
            if (!result) return wikiJson(wikiErrorBody('剧情来源不存在'), 404);
            if (result.status === 'conflict') {
                return wikiJson({
                    ...wikiErrorBody('卡片已被其他编辑更新，请刷新后重试'),
                    mediaRevision: result.revision
                }, 409);
            }
            await cleanupWikiObjects(services, result.cleanupImageFiles.map((imageFile) =>
                storyObjectKey(
                    target.agency.code,
                    target.idol.folderName,
                    imageFile
                )
            ));
            return wikiJson({
                status: 'success',
                cardDeleted: result.cardDeleted,
                mediaRevision: result.revision
            });
        } catch (error) {
            return wikiJson(
                wikiErrorBody(wikiMessageOf(error, '删除剧情来源失败')),
                error instanceof SyntaxError ? 400 : wikiStatusOf(error)
            );
        }
    };
}
