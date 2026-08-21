import type { Env } from 'hono';
import {
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
    WikiLayoutRequest,
    WikiValidatedInput
} from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';

export function createHandleSaveWikiLayout<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E,
    WikiValidatedInput<'param', WikiIdParams> &
    WikiValidatedInput<'json', WikiLayoutRequest>
> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        try {
            const agencyId = context.req.valid('param').id;
            const body = context.req.valid('json');
            const result = await services.story!.saveWikiLayout({
                agencyId,
                expectedRevision: body.expectedRevision,
                groups: body.groups
            });
            if (result.status === 'conflict') {
                return wikiJson({
                    status: 'error',
                    msg: '布局已被其他操作更新，请重新加载',
                    layoutRevision: result.revision
                }, 409);
            }
            return wikiJson({
                status: 'success',
                layoutRevision: result.revision
            });
        } catch (error) {
            return wikiJson(
                wikiErrorBody(wikiMessageOf(error, '保存布局失败')),
                wikiStatusOf(error)
            );
        }
    };
}
