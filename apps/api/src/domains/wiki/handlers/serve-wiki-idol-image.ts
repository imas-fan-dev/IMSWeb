import type { Env, Handler } from 'hono';
import {
    decodeWikiSegment,
    wikiPlain,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    isSupportedAgencyCode,
    requireWikiServices,
    storyObjectKey
} from '@/domains/wiki/service';
import { objectReadResponse } from '@/utils/http/object-read-response';

export function createHandleServeWikiIdolImage<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
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
        if (!agency || !isSupportedAgencyCode(agency.code)) return wikiPlain('Not found', 404);
        const idol = await services.story!.findIdolByAgencyAndName(agency.id, idolName);
        if (!idol) return wikiPlain('Not found', 404);
        let response;
        try {
            response = await objectReadResponse(
                context.req.raw,
                services.storage!,
                storyObjectKey(agency.code, idol.folder_name, filename)
            );
        } catch {
            return wikiPlain('Not found', 404);
        }
        return response ?? wikiPlain('Not found', 404);
    };
}
