import type { Env, Handler } from 'hono';
import {
    authorizeWikiRead,
    wikiJson,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    isSupportedAgencyCode,
    listAgencyIconUrls,
    requireWikiServices
} from '@/domains/wiki/service';

export function createHandleListAdminWikiCatalog<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiRead(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage']);
        const [agencyRows, idolRows, agencyIconUrls] = await Promise.all([
            services.story!.listAgencies(),
            services.story!.listIdolsWithAgencies(),
            listAgencyIconUrls(services.storage!)
        ]);
        const idolsByAgency = new Map<number, Array<{
            id: number;
            name: string;
            folderName: string;
            color: string | null;
        }>>();
        for (const idol of idolRows) {
            if (!isSupportedAgencyCode(idol.agency_code)) continue;
            const group = idolsByAgency.get(idol.agency_id) ?? [];
            group.push({
                id: idol.id,
                name: idol.name_cn,
                folderName: idol.folder_name,
                color: idol.color
            });
            idolsByAgency.set(idol.agency_id, group);
        }
        return wikiJson({
            status: 'success',
            agencies: agencyRows.flatMap((agency) =>
                isSupportedAgencyCode(agency.code)
                    ? [{
                        id: agency.id,
                        code: agency.code,
                        name: agency.name_cn,
                        color: agency.color,
                        iconUrl: agencyIconUrls.get(agency.code) ?? null,
                        idols: idolsByAgency.get(agency.id) ?? []
                    }]
                    : []
            )
        });
    };
}
