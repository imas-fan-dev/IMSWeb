import type { Env, Handler } from 'hono';
import {
    decodeWikiSegment,
    wikiMessageOf,
    wikiPlain,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { requireWikiServices, wikiStaticObjectKey } from '@/domains/wiki/service';
import { objectReadResponse } from '@/utils/http/object-read-response';

export function createHandleServeWikiStaticAssets<E extends Env>(
    resolveServices: WikiServicesResolver<E>,
    kind: 'icon' | 'css'
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['staticAssets']);
        const segments = new URL(context.req.raw.url).pathname.split('/').slice(2);
        try {
            const relativePath = segments.map(decodeWikiSegment).join('/');
            const object = services.storage
                ? await objectReadResponse(
                    context.req.raw,
                    services.storage,
                    wikiStaticObjectKey(kind, relativePath)
                )
                : null;
            if (object) return object;
        } catch (error) {
            const message = wikiMessageOf(error, '');
            if (message.startsWith('Forbidden') || message.startsWith('invalid Wiki')) {
                return wikiPlain('Forbidden', 403);
            }
        }
        return services.staticAssets!.fetch(context.req.raw);
    };
}
