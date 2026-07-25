import type { Env, Handler } from 'hono';
import {
    authorizeWikiRead,
    wikiJson,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    requireWikiServices,
    wikiGroupIconUrl
} from '@/domains/wiki/service';

export function createHandleListAdminWikiCatalog<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiRead(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story']);
        const [agencyRows, idolRows, groupRows, memberRows] = await Promise.all([
            services.story!.listAgencies(),
            services.story!.listIdolsWithAgencies(),
            services.story!.listWikiGroups(),
            services.story!.listWikiGroupMembers()
        ]);
        const idols = new Map<number, {
            id: number;
            name: string;
            folderName: string;
            color: string | null;
            textColor: string;
            displayOrder: number;
            imageUrl: string;
            imageFit: 'cover' | 'contain';
        }>();
        for (const idol of idolRows) {
            if (!idol.wiki_enabled) continue;
            idols.set(idol.id, {
                id: idol.id,
                name: idol.name_cn,
                folderName: idol.folder_name,
                color: idol.color,
                textColor: idol.text_color,
                displayOrder: idol.display_order,
                imageUrl: idol.avatar_object_key
                    ? `/image/${encodeURIComponent(idol.agency_name)}/${encodeURIComponent(idol.name_cn)}/icon.webp`
                    : '',
                imageFit: idol.avatar_fit
            });
        }
        const membersByGroup = new Map<number, typeof memberRows>();
        for (const member of memberRows) {
            const members = membersByGroup.get(member.group_id) ?? [];
            members.push(member);
            membersByGroup.set(member.group_id, members);
        }
        return wikiJson({
            status: 'success',
            agencies: agencyRows.map((agency) => ({
                id: agency.id,
                code: agency.code,
                name: agency.name_cn,
                color: agency.color,
                wikiEnabled: agency.wiki_enabled,
                bannerTitle: agency.banner_title,
                displayOrder: agency.display_order,
                layoutRevision: agency.layout_revision,
                iconUrl: agency.icon_object_key ? `/icon/agencies/${agency.id}.webp` : null,
                groups: groupRows.filter((group) => group.agency_id === agency.id).map((group) => ({
                    id: group.id,
                    code: group.code,
                    name: group.name,
                    color: group.color,
                    iconUrl: group.icon_object_key ? wikiGroupIconUrl(group.id) : null,
                    displayOrder: group.display_order,
                    isFallback: group.is_fallback,
                    idols: (membersByGroup.get(group.id) ?? []).flatMap((member) => {
                        const idol = idols.get(member.idol_id);
                        return idol ? [{ ...idol, displayOrder: member.display_order }] : [];
                    })
                }))
            }))
        });
    };
}
