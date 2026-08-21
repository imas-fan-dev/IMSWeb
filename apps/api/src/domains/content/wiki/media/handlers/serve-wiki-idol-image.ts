import type { Env } from 'hono';
import {
    decodeWikiSegment,
    wikiPlain,
    type WikiServicesResolver
} from '@/domains/content/wiki/handler-support';
import {
    requireWikiServices,
    storyObjectKey
} from '@/domains/content/wiki/service';
import { objectReadResponse } from '@/utils/http/object-read-response';
import type { WikiBinaryRouteHandler } from '@/domains/content/wiki/response';

export function createHandleServeWikiIdolImage<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiBinaryRouteHandler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story', 'storage']);
        let agencyName: string;
        let idolName: string;
        let filename: string;
        const pathSegments = new URL(context.req.raw.url).pathname.split('/');
        if (pathSegments.length < 5 || pathSegments[1] !== 'image') {
            return wikiPlain('Not found', 404);
        }
        try {
            agencyName = decodeWikiSegment(pathSegments[2]);
            idolName = decodeWikiSegment(pathSegments[3]);
            filename = pathSegments.slice(4).map(decodeWikiSegment).join('/');
        } catch {
            return wikiPlain('Forbidden', 403);
        }
        if (!agencyName || !idolName || !filename) return wikiPlain('Not found', 404);
        const agency = await services.story!.findAgencyByName(agencyName);
        if (!agency) return wikiPlain('Not found', 404);
        const idol = await services.story!.findIdolByAgencyAndName(agency.id, idolName);
        if (!idol) return wikiPlain('Not found', 404);
        let response;
        try {
            response = await objectReadResponse(
                context.req.raw,
                services.storage!,
                /^icon\.[a-z0-9]+$/i.test(filename)
                    ? idol.avatar_object_key ?? ''
                    : storyObjectKey(agency.code, idol.folder_name, filename)
            );
        } catch {
            return wikiPlain('Not found', 404);
        }
        return response ?? wikiPlain('Not found', 404);
    };
}
