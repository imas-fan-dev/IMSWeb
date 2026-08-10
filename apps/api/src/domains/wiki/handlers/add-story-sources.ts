import type { Env } from 'hono';
import {
    authorizeWikiWrite,
    findWikiMutationTarget,
    resolveWikiStorySources,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { requireWikiServices } from '@/domains/wiki/service';
import type {
    WikiIdParams,
    WikiStorySourcesRequest,
    WikiValidatedInput
} from '@/domains/wiki/request';
import type { WikiRouteHandler } from '@/domains/wiki/response';

export function createHandleAddWikiStorySources<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiIdParams> &
    WikiValidatedInput<'json', WikiStorySourcesRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const cardId = context.req.valid('param').id;
            const body = context.req.valid('json');
            const target = await findWikiMutationTarget(
                services,
                body.agency,
                body.idol,
                404
            );
            if ('error' in target) return target.error;
            const links = await resolveWikiStorySources(
                services.story!,
                body.sources
            );
            const result = await services.story!.addStoryCardSources({
                agencyCode: target.agency.code,
                idolId: target.idol.id,
                cardId,
                expectedRevision: body.expectedRevision,
                links
            });
            if (result.status === 'conflict') {
                return wikiJson({
                    ...wikiErrorBody('卡片已被其他编辑更新，请刷新后重试'),
                    mediaRevision: result.revision
                }, 409);
            }
            return wikiJson({
                status: 'success',
                sourceCount: result.ids.length,
                mediaRevision: result.revision
            });
        } catch (error) {
            return wikiJson(
                wikiErrorBody(wikiMessageOf(error, '新增剧情来源失败')),
                error instanceof SyntaxError ? 400 : wikiStatusOf(error)
            );
        }
    };
}
