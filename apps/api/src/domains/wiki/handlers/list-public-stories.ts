import type { Env, Handler } from "hono";
import {
  wikiErrorBody,
  wikiJson,
  type WikiServicesResolver,
} from "@/domains/wiki/handler-support";
import {
  aggregateStories,
  requireWikiServices,
  storyObjectKey,
  toWikiAgency,
  toWikiIdolFromRecord,
} from "@/domains/wiki/service";
import { resolvePublicObjectUrl } from "@/utils/storage/public-object-url";

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
    const agencyRecord = await services.story!.findAgencyByName(agencyName) ??
      await services.story!.findAgencyByCode(agencyName);
    const agency = agencyRecord ? toWikiAgency(agencyRecord) : null;
    if (!agency || !agencyRecord?.wiki_enabled) {
      return wikiJson(wikiErrorBody("企划不存在"), 404);
    }
    const idolRecord = await services.story!.findIdolByAgencyAndName(
      agency.id,
      idolName,
    );
    if (!idolRecord?.wiki_enabled) return wikiJson(wikiErrorBody("找不到该偶像"), 404);
    const [storyRows, categoryRows] = await Promise.all([
      services.story!.listStories(agency.code, idolRecord.id),
      services.story!.listWikiCategories(agency.id, idolRecord.id),
    ]);
    const idol = toWikiIdolFromRecord(agency, idolRecord);
    const categories = aggregateStories(
      storyRows,
      categoryRows,
      agency.name,
      idol.name,
    );
    const storyRowsByCard = new Map(storyRows.map((row) => [
      `${row.category}\u0000${row.card_name}`,
      row,
    ]));
    const publicCategories = await Promise.all(categories.map(async (category) => ({
      ...category,
      cards: await Promise.all(category.cards.map(async (card) => {
        const row = storyRowsByCard.get(`${category.name}\u0000${card.name}`);
        return {
          ...card,
          img: row?.image_file
            ? await resolvePublicObjectUrl(
                services.storage!,
                storyObjectKey(agency.code, idol.folderName, row.image_file),
                card.img,
              )
            : card.img,
        };
      })),
    })));
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
        imageUrl: idolRecord.avatar_object_key
          ? await resolvePublicObjectUrl(
              services.storage!,
              idolRecord.avatar_object_key,
              idol.avatarUrl ?? "",
            )
          : "",
        imageFit: idol.avatarFit ?? "cover",
        textColor: idol.textColor ?? "#ffffff",
      },
      categories: publicCategories,
    });
  };
}
