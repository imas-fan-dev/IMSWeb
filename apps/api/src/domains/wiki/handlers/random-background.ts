import type { Env, Handler } from 'hono';
import {
    wikiJson,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { randomBackground, requireWikiServices } from '@/domains/wiki/service';

export function createHandleRandomWikiBackground<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story']);
        return wikiJson(await randomBackground(services.story!));
    };
}
