import type { Env } from 'hono';
import {
    wikiJson,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { randomBackground, requireWikiServices } from '@/domains/wiki/service';
import type { WikiRouteHandler } from '@/domains/wiki/response';

export function createHandleRandomWikiBackground<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story', 'storage']);
        return wikiJson(await randomBackground(services.story!, services.storage!));
    };
}
