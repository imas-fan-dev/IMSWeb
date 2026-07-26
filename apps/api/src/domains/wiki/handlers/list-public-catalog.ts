import type { Env, Handler } from "hono";
import {
  wikiErrorBody,
  wikiJson,
  type WikiServicesResolver,
} from "@/domains/wiki/handler-support";
import {
  requireWikiServices,
  toWikiIdol,
  wikiGroupIconUrl,
} from "@/domains/wiki/service";
import { resolvePublicObjectUrl } from "@/utils/storage/public-object-url";

export function createHandleListPublicWikiCatalog<E extends Env>(
  resolveServices: WikiServicesResolver<E>,
): Handler<E> {
  return async (context) => {
    const services = await resolveServices(context);
    requireWikiServices(services, ["story", "storage"]);
    const [agencyRows, idolRows, groupRows, memberRows] = await Promise.all([
      services.story!.listAgencies(),
      services.story!.listIdolsWithAgencies(),
      services.story!.listWikiGroups(),
      services.story!.listWikiGroupMembers(),
    ]);
    const counts = new Map<number, number>();
    for (const idol of idolRows) {
      if (!idol.wiki_enabled) continue;
      counts.set(idol.agency_id, (counts.get(idol.agency_id) ?? 0) + 1);
    }
    const agencies = await Promise.all(agencyRows
      .filter((agency) => agency.wiki_enabled)
      .map(async (agency) => ({
        id: agency.id,
        code: agency.code,
        name: agency.name_cn,
        color: agency.color,
        bannerTitle: agency.banner_title,
        iconUrl: agency.icon_object_key
          ? await resolvePublicObjectUrl(
              services.storage!,
              agency.icon_object_key,
              `/icon/agencies/${agency.id}.webp`,
            )
          : null,
        idolCount: counts.get(agency.id) ?? 0,
      })));
    const requestedAgency = (context.req.query("agency") ?? "").trim();
    const selectedAgency = requestedAgency
      ? agencies.find(
          (agency) =>
            agency.name === requestedAgency || agency.code === requestedAgency,
        )
      : agencies[0];
    if (requestedAgency && !selectedAgency) {
      return wikiJson(wikiErrorBody("企划不存在"), 404);
    }
    if (!selectedAgency) {
      return wikiJson({ status: "success", agencies, selection: null });
    }
    const selectedRows = idolRows.filter(
      (idol) =>
        idol.agency_id === selectedAgency.id &&
        idol.wiki_enabled,
    );
    const idols = new Map(await Promise.all(selectedRows.map(async (row) => {
      const idol = toWikiIdol(row);
      return [idol.id, {
        id: idol.id,
        name: idol.name,
        folderName: idol.folderName,
        color: idol.color,
        imageUrl: row.avatar_object_key
          ? await resolvePublicObjectUrl(
              services.storage!,
              row.avatar_object_key,
              idol.avatarUrl ?? "",
            )
          : "",
        imageFit: idol.avatarFit ?? "cover",
        textColor: idol.textColor ?? "#ffffff",
      }] as const;
    })));
    const membersByGroup = new Map<number, typeof memberRows>();
    for (const member of memberRows) {
      if (member.agency_id !== selectedAgency.id) continue;
      const members = membersByGroup.get(member.group_id) ?? [];
      members.push(member);
      membersByGroup.set(member.group_id, members);
    }
    const groups = groupRows
      .filter((group) => group.agency_id === selectedAgency.id)
      .map(async (group) => ({
        id: group.id,
        code: group.code,
        name: group.name,
        color: group.color,
        iconUrl: group.icon_object_key
          ? await resolvePublicObjectUrl(
              services.storage!,
              group.icon_object_key,
              wikiGroupIconUrl(group.id),
            )
          : null,
        idols: (membersByGroup.get(group.id) ?? []).flatMap((member) => {
          const idol = idols.get(member.idol_id);
          return idol ? [idol] : [];
        }),
      }));
    const resolvedGroups = await Promise.all(groups);
    const selectedAgencyRow = agencyRows.find((agency) => agency.id === selectedAgency.id)!;
    return wikiJson({
      status: "success",
      agencies,
      selection: {
        agency: selectedAgency,
        layoutRevision: selectedAgencyRow.layout_revision,
        groups: resolvedGroups,
      },
    });
  };
}
