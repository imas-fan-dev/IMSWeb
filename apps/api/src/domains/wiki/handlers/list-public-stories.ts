import type { Env } from "hono";
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
import {
  requirePublicObjectUrl,
  resolvePublicObjectUrl,
} from "@/utils/storage/public-object-url";
import type {
  WikiStoriesQuery,
  WikiValidatedInput,
} from "@/domains/wiki/request";
import type { WikiRouteHandler } from "@/domains/wiki/response";

export function createHandleListPublicWikiStories<E extends Env>(
  resolveServices: WikiServicesResolver<E>,
): WikiRouteHandler<E, WikiValidatedInput<"query", WikiStoriesQuery>> {
  return async (context) => {
    const services = await resolveServices(context);
    requireWikiServices(services, ["story", "storage"]);
    const { agency: agencyName, idol: idolName } = context.req.valid("query");
    if (!agencyName || !idolName) {
      return wikiJson(wikiErrorBody("缺少企划或内容页参数"), 400);
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
    if (!idolRecord?.wiki_enabled) return wikiJson(wikiErrorBody("找不到该内容页"), 404);
    const [storyRows, cardRows, categoryRows] = await Promise.all([
      services.story!.listStories(agency.code, idolRecord.id),
      services.story!.listStoryCards(agency.code, idolRecord.id),
      services.story!.listWikiCategories(agency.id, idolRecord.id),
    ]);
    const idol = toWikiIdolFromRecord(agency, idolRecord);
    const categories = aggregateStories(
      storyRows,
      categoryRows,
      agency.name,
      idol.name,
      cardRows,
    );
    const storyRowsByCard = new Map(cardRows.map((row) => [
      `${row.category}\u0000${row.card_name}`,
      row,
    ]));
    const publicCategories = await Promise.all(categories.map(async (category) => ({
      ...category,
      cards: await Promise.all(category.cards.map(async (card) => {
        const row = storyRowsByCard.get(`${category.name}\u0000${card.name}`);
        return {
          ...card,
          img: row?.cover_asset_object_key || row?.image_file
            ? row.cover_asset_object_key
              ? await requirePublicObjectUrl(
                  services.storage!,
                  row.cover_asset_object_key,
                )
              : await resolvePublicObjectUrl(
                  services.storage!,
                  storyObjectKey(agency.code, idol.folderName, row.image_file!),
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
        wikiUrl: idol.wikiUrl,
        imageUrl: idolRecord.avatar_object_key
          ? await resolvePublicObjectUrl(
              services.storage!,
              idolRecord.avatar_object_key,
              idol.avatarUrl ?? "",
            )
          : "",
        imageFit: idol.avatarFit ?? "cover",
        imageTransform: idol.avatarTransform,
        textColor: idol.textColor ?? "#ffffff",
        entryKind: idol.entryKind,
        entrySubtype: idol.entrySubtype,
      },
      categories: publicCategories,
    });
  };
}
