import type { Env } from 'hono';
import {
    authorizeWikiWrite,
    wikiErrorBody,
    wikiJson,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { parseBilibili, requireWikiServices } from '@/domains/wiki/service';
import type {
    WikiBilibiliRequest,
    WikiValidatedInput
} from '@/domains/wiki/request';
import type { WikiRouteHandler } from '@/domains/wiki/response';

export function createHandleParseBilibili<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E, WikiValidatedInput<'json', WikiBilibiliRequest>> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['fetch']);
        const body = context.req.valid('json');
        try {
            return wikiJson(await parseBilibili(body.url, services.fetch!));
        } catch {
            return wikiJson(wikiErrorBody('解析请求失败'), 502);
        }
    };
}
