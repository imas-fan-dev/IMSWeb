import type { Env, Handler } from 'hono';
import {
    wikiJson,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { buildIdolMediaCatalog, requireWikiServices } from '@/domains/wiki/service';

export function createHandleListWikiIdolMedia<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story', 'storage']);
        return wikiJson({
            status: 'success',
            agencies: await buildIdolMediaCatalog(services.story!, services.storage!)
        });
    };
}
