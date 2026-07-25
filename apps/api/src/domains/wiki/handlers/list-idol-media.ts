import type { Env, Handler } from 'hono';
import {
    wikiJson,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { idolMediaUrl, requireWikiServices } from '@/domains/wiki/service';

export function createHandleListWikiIdolMedia<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story']);
        const [agencyRows, idolRows] = await Promise.all([
            services.story!.listAgencies(),
            services.story!.listIdolsWithAgencies()
        ]);
        return wikiJson({
            status: 'success',
            agencies: agencyRows.map((agency) => ({
                code: agency.code,
                name: agency.name_cn,
                idols: idolRows.filter((idol) => idol.agency_id === agency.id).map((idol) => ({
                    name: idol.name_cn,
                    imageUrl: idol.avatar_object_key
                        ? idolMediaUrl(agency.name_cn, idol.name_cn)
                        : '',
                    imageFit: idol.avatar_fit,
                    source: idol.avatar_object_key ? 'object-storage' : 'none'
                }))
            }))
        });
    };
}
