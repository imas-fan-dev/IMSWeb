import type { Env, Handler } from "hono";
import {
  wikiErrorBody,
  wikiJson,
  type WikiServicesResolver,
} from "@/domains/wiki/handler-support";
import {
  aggregateStories,
  findAvatar,
  getPresetCategories,
  requireWikiServices,
  toWikiAgency,
  toWikiIdolFromRecord,
} from "@/domains/wiki/service";

export function createHandleListPublicWikiStories<E extends Env>(
  resolveServices: WikiServicesResolver<E>,
): Handler<E> {
  return async (context) => {
    const services = await resolveServices(context);
    requireWikiServices(services, ["story", "storage"]);
    const agencyName = (context.req.query("agency") ?? "").trim();
    const idolName = (context.req.query("idol") ?? "").trim();
    if (!agencyName || !idolName) {
      return wikiJson(wikiErrorBody("缺少企划或偶像参数"), 400);
    }
    const agencyRecord = await services.story!.findAgencyByName(agencyName);
    const agency = agencyRecord ? toWikiAgency(agencyRecord) : null;
    if (!agency) return wikiJson(wikiErrorBody("企划不存在"), 404);
    const idolRecord = await services.story!.findIdolByAgencyAndName(
      agency.id,
      idolName,
    );
    if (!idolRecord) return wikiJson(wikiErrorBody("找不到该偶像"), 404);
    const [storyRows, avatar] = await Promise.all([
      services.story!.listStories(agency.code, idolRecord.id),
      findAvatar(
        services.storage!,
        agency.code,
        idolRecord.folder_name,
        agency.name,
        idolRecord.name_cn,
      ),
    ]);
    const presetCategories = getPresetCategories(
      agency.name,
      idolRecord.name_cn,
    );
    const idol = toWikiIdolFromRecord(agency, idolRecord, avatar);
    return wikiJson({
      status: "success",
      agency: {
        id: agency.id,
        code: agency.code,
        name: agency.name,
        color: agency.color,
      },
      idol: {
        id: idol.id,
        name: idol.name,
        folderName: idol.folderName,
        color: idol.color,
        imageUrl: idol.avatarUrl ?? "",
        imageFit: idol.avatarFit ?? "cover",
        textColor: idol.textColor ?? "#ffffff",
      },
      categories: aggregateStories(
        storyRows,
        presetCategories,
        agency.name,
        idol.name,
      ),
    });
  };
}
