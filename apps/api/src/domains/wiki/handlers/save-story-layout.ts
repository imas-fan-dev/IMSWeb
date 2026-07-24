import type { Env, Handler } from 'hono';
import {
    authorizeWikiWrite,
    wikiJson,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';

export function createHandleSaveWikiStoryLayout<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        return unauthorized ?? wikiJson({ status: 'success' });
    };
}
