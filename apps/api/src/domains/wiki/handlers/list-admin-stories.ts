import type { Env, Handler } from "hono";
import {
  authorizeWikiRead,
  wikiErrorBody,
  wikiJson,
  type WikiServicesResolver,
} from "@/domains/wiki/handler-support";
import {
  requireWikiServices,
  toWikiAgency,
  wikiStoryImageUrl,
} from "@/domains/wiki/service";

export function createHandleListAdminWikiStories<E extends Env>(
  resolveServices: WikiServicesResolver<E>,
): Handler<E> {
  return async (context) => {
    const services = await resolveServices(context);
    const unauthorized = await authorizeWikiRead(context, services);
    if (unauthorized) return unauthorized;
    requireWikiServices(services, ["story"]);
    const agencyName = (context.req.query("agency") ?? "").trim();
    const idolName = (context.req.query("idol") ?? "").trim();
    if (!agencyName || !idolName) {
      return wikiJson(wikiErrorBody("缺少企划或偶像参数"), 400);
    }
    const agencyRecord = await services.story!.findAgencyByName(agencyName) ??
      await services.story!.findAgencyByCode(agencyName);
    const agency = agencyRecord ? toWikiAgency(agencyRecord) : null;
    if (!agency) return wikiJson(wikiErrorBody("企划不存在"), 404);
    const idol = await services.story!.findIdolByAgencyAndName(
      agency.id,
      idolName,
    );
    if (!idol) return wikiJson(wikiErrorBody("找不到该偶像"), 404);
    const [stories, categoryRows] = await Promise.all([
      services.story!.listStories(agency.code, idol.id),
      services.story!.listWikiCategories(agency.id, idol.id),
    ]);
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
        name: idol.name_cn,
        folderName: idol.folder_name,
        color: idol.color,
        textColor: idol.text_color,
        displayOrder: idol.display_order,
        imageUrl: idol.avatar_object_key
          ? `/image/${encodeURIComponent(agency.name)}/${encodeURIComponent(idol.name_cn)}/icon.webp`
          : "",
        imageFit: idol.avatar_fit,
      },
      categories: categoryRows.map((category) => ({
        id: category.id,
        name: category.name,
        storageSlug: category.storage_slug,
        displayOrder: category.display_order,
        showWhenEmpty: category.show_when_empty,
        backgroundEligible: category.background_eligible,
      })),
      stories: stories.map((story) => ({
        id: story.id,
        category: story.category,
        cardName: story.card_name,
        upName: story.up_name,
        videoTitle: story.video_title,
        url: story.url,
        subtitle: story.subtitle ?? "",
        imageFile: story.image_file,
        imageUrl: wikiStoryImageUrl(
          agency.name,
          idol.name_cn,
          story.image_file,
        ),
      })),
    });
  };
}
