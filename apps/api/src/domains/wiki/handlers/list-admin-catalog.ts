import type { Env, Handler } from 'hono';
import {
    authorizeWikiRead,
    wikiJson,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    agencyImageTransform,
    groupImageTransform,
    idolImageTransform,
    requireWikiServices,
    wikiGroupIconUrl
} from '@/domains/wiki/service';
import { resolvePublicObjectUrl } from '@/utils/storage/public-object-url';

function revisionedUrl(url: string, revision: number): string {
    return url ? `${url}${url.includes('?') ? '&' : '?'}v=${revision}` : url;
}

export function createHandleListAdminWikiCatalog<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiRead(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage']);
        const [agencyRows, idolRows, groupRows, memberRows] = await Promise.all([
            services.story!.listAgencies(),
            services.story!.listIdolsWithAgencies(),
            services.story!.listWikiGroups(),
            services.story!.listWikiGroupMembers()
        ]);
        const idols = new Map(await Promise.all(idolRows.map(async (idol) => [
            idol.id,
            {
                id: idol.id,
                agencyId: idol.agency_id,
                name: idol.name_cn,
                folderName: idol.folder_name,
                color: idol.color,
                wikiEnabled: idol.wiki_enabled,
                textColor: idol.text_color,
                displayOrder: idol.display_order,
                imageUrl: idol.avatar_object_key
                    ? revisionedUrl(
                        await resolvePublicObjectUrl(
                            services.storage!,
                            idol.avatar_object_key,
                            `/image/${encodeURIComponent(idol.agency_name)}/` +
                                `${encodeURIComponent(idol.name_cn)}/icon.webp`
                        ),
                        idol.avatar_media_revision
                    )
                    : '',
                imageFit: idol.avatar_fit,
                imageTransform: idolImageTransform(idol),
                mediaRevision: idol.avatar_media_revision,
                entryKind: idol.entry_kind,
                entrySubtype: idol.entry_subtype
            }
        ] as const)));
        const membersByGroup = new Map<number, typeof memberRows>();
        const groupIdsByIdol = new Map<number, number[]>();
        for (const member of memberRows) {
            const members = membersByGroup.get(member.group_id) ?? [];
            members.push(member);
            membersByGroup.set(member.group_id, members);
            const groupIds = groupIdsByIdol.get(member.idol_id) ?? [];
            groupIds.push(member.group_id);
            groupIdsByIdol.set(member.idol_id, groupIds);
        }
        const agencies = await Promise.all(agencyRows.map(async (agency) => ({
            id: agency.id,
            code: agency.code,
            name: agency.name_cn,
            color: agency.color,
            wikiEnabled: agency.wiki_enabled,
            bannerTitle: agency.banner_title,
            displayOrder: agency.display_order,
            layoutRevision: agency.layout_revision,
            iconUrl: agency.icon_object_key
                ? revisionedUrl(
                    await resolvePublicObjectUrl(
                        services.storage!,
                        agency.icon_object_key,
                        `/icon/agencies/${agency.id}.webp`
                    ),
                    agency.icon_media_revision
                )
                : null,
            imageTransform: agencyImageTransform(agency),
            mediaRevision: agency.icon_media_revision,
            idols: idolRows
                .filter((idol) => idol.agency_id === agency.id)
                .flatMap((idol) => {
                    const item = idols.get(idol.id);
                    return item
                        ? [{ ...item, groupIds: groupIdsByIdol.get(idol.id) ?? [] }]
                        : [];
                }),
            groups: await Promise.all(groupRows
                .filter((group) => group.agency_id === agency.id)
                .map(async (group) => ({
                    id: group.id,
                    code: group.code,
                    name: group.name,
                    color: group.color,
                    iconUrl: group.icon_object_key
                        ? revisionedUrl(
                            await resolvePublicObjectUrl(
                                services.storage!,
                                group.icon_object_key,
                                wikiGroupIconUrl(group.id)
                            ),
                            group.icon_media_revision
                        )
                        : null,
                    displayOrder: group.display_order,
                    isFallback: group.is_fallback,
                    imageTransform: groupImageTransform(group),
                    mediaRevision: group.icon_media_revision,
                    idolIds: (membersByGroup.get(group.id) ?? [])
                        .map((member) => member.idol_id),
                    idols: (membersByGroup.get(group.id) ?? []).flatMap((member) => {
                        const idol = idols.get(member.idol_id);
                        return idol ? [{
                            ...idol,
                            groupIds: groupIdsByIdol.get(idol.id) ?? [],
                            displayOrder: member.display_order
                        }] : [];
                    })
                })))
        })));
        return wikiJson({
            status: 'success',
            agencies
        });
    };
}
