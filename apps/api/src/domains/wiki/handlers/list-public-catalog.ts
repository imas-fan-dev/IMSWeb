import type { Env, Handler } from "hono";
import {
  wikiErrorBody,
  wikiJson,
  type WikiServicesResolver,
} from "@/domains/wiki/handler-support";
import {
  findAvatar,
  isSupportedAgencyCode,
  listAgencyIconUrls,
  requireWikiServices,
  toWikiIdol,
} from "@/domains/wiki/service";

export function createHandleListPublicWikiCatalog<E extends Env>(
  resolveServices: WikiServicesResolver<E>,
): Handler<E> {
  return async (context) => {
    const services = await resolveServices(context);
    requireWikiServices(services, ["story", "storage"]);
    const [agencyRows, idolRows, agencyIconUrls] = await Promise.all([
      services.story!.listAgencies(),
      services.story!.listIdolsWithAgencies(),
      listAgencyIconUrls(services.storage!),
    ]);
    const counts = new Map<number, number>();
    for (const idol of idolRows) {
      if (!isSupportedAgencyCode(idol.agency_code)) continue;
      counts.set(idol.agency_id, (counts.get(idol.agency_id) ?? 0) + 1);
    }
    const agencies = agencyRows.flatMap((agency) =>
      isSupportedAgencyCode(agency.code)
        ? [
            {
              id: agency.id,
              code: agency.code,
              name: agency.name_cn,
              color: agency.color,
              iconUrl: agencyIconUrls.get(agency.code) ?? null,
              idolCount: counts.get(agency.id) ?? 0,
            },
          ]
        : [],
    );
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
        isSupportedAgencyCode(idol.agency_code),
    );
    const idols = await Promise.all(
      selectedRows.map(async (row) => {
        const avatar = await findAvatar(
          services.storage!,
          row.agency_code,
          row.folder_name,
          row.agency_name,
          row.name_cn,
        );
        const idol = toWikiIdol(row, avatar)!;
        return {
          id: idol.id,
          name: idol.name,
          folderName: idol.folderName,
          color: idol.color,
          imageUrl: idol.avatarUrl ?? "",
          imageFit: idol.avatarFit ?? "cover",
          textColor: idol.textColor ?? "#ffffff",
        };
      }),
    );
    return wikiJson({
      status: "success",
      agencies,
      selection: {
        agency: selectedAgency,
        idols,
      },
    });
  };
}
