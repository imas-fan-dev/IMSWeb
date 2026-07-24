import type { Env, Handler } from "hono";
import {
  authorizeWikiRead,
  wikiErrorBody,
  wikiJson,
  type WikiServicesResolver,
} from "@/domains/wiki/handler-support";
import {
  getPresetCategories,
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
    const agencyRecord = await services.story!.findAgencyByName(agencyName);
    const agency = agencyRecord ? toWikiAgency(agencyRecord) : null;
    if (!agency) return wikiJson(wikiErrorBody("企划不存在"), 404);
    const idol = await services.story!.findIdolByAgencyAndName(
      agency.id,
      idolName,
    );
    if (!idol) return wikiJson(wikiErrorBody("找不到该偶像"), 404);
    const stories = await services.story!.listStories(agency.code, idol.id);
    const presetCategories = getPresetCategories(agency.name, idol.name_cn);
    const categories = [
      ...new Set([
        ...presetCategories,
        ...stories.map((story) => story.category),
      ]),
    ];
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
      },
      categories,
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
