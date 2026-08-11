import type { Env } from "hono";
import {
  authorizeWikiRead,
  wikiErrorBody,
  wikiJson,
  type WikiServicesResolver,
} from "@/domains/wiki/handler-support";
import {
  idolImageTransform,
  requireWikiServices,
  storyObjectKey,
  storyImageTransform,
  toWikiAgency,
  wikiStoryImageUrl,
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

function revisionedUrl(url: string, revision: number): string {
  return url ? `${url}${url.includes("?") ? "&" : "?"}v=${revision}` : url;
}

export function createHandleListAdminWikiStories<E extends Env>(
  resolveServices: WikiServicesResolver<E>,
): WikiRouteHandler<E, WikiValidatedInput<"query", WikiStoriesQuery>> {
  return async (context) => {
    const services = await resolveServices(context);
    const unauthorized = await authorizeWikiRead(context, services);
    if (unauthorized) return unauthorized;
    requireWikiServices(services, ["story", "storage"]);
    const { agency: agencyName, idol: idolName } = context.req.valid("query");
    if (!agencyName || !idolName) {
      return wikiJson(wikiErrorBody("缺少企划或内容页参数"), 400);
    }
    const agencyRecord = await services.story!.findAgencyByName(agencyName) ??
      await services.story!.findAgencyByCode(agencyName);
    const agency = agencyRecord ? toWikiAgency(agencyRecord) : null;
    if (!agency) return wikiJson(wikiErrorBody("企划不存在"), 404);
    const idol = await services.story!.findIdolByAgencyAndName(
      agency.id,
      idolName,
    );
    if (!idol) return wikiJson(wikiErrorBody("找不到该内容页"), 404);
    const [stories, cardRows, categoryRows, contentTypes, sourcePlatforms] = await Promise.all([
      services.story!.listStories(agency.code, idol.id),
      services.story!.listStoryCards(agency.code, idol.id),
      services.story!.listWikiCategories(agency.id, idol.id),
      services.story!.listStoryContentTypes(),
      services.story!.listStorySourcePlatforms(),
    ]);
    const [idolImageUrl, resolvedCards, resolvedStories] = await Promise.all([
      idol.avatar_object_key
        ? resolvePublicObjectUrl(
            services.storage!,
            idol.avatar_object_key,
            `/image/${encodeURIComponent(agency.name)}/` +
              `${encodeURIComponent(idol.name_cn)}/icon.webp`,
          ).then((url) => revisionedUrl(url, idol.avatar_media_revision))
        : Promise.resolve(""),
      Promise.all(cardRows.map(async (card) => ({
        cardId: card.card_id,
        category: card.category,
        cardName: card.card_name,
        subtitle: card.subtitle ?? "",
        imageFile: card.image_file,
        coverAssetId: card.cover_asset_id,
        coverAssetName: card.cover_asset_name,
        imageUrl: card.cover_asset_object_key || card.image_file
          ? revisionedUrl(
              card.cover_asset_object_key
                ? await requirePublicObjectUrl(
                    services.storage!,
                    card.cover_asset_object_key,
                  )
                : await resolvePublicObjectUrl(
                    services.storage!,
                    storyObjectKey(agency.code, idol.folder_name, card.image_file!),
                    wikiStoryImageUrl(agency.name, idol.name_cn, card.image_file),
                  ),
              card.cover_asset_revision ?? card.image_media_revision,
            )
          : "",
        imageTransform: storyImageTransform(card),
        mediaRevision: card.image_media_revision,
        revision: card.image_media_revision,
      }))),
      Promise.all(stories.map(async (story) => ({
        id: story.id,
        category: story.category,
        cardName: story.card_name,
        upName: story.up_name,
        videoTitle: story.video_title,
        url: story.url,
        contentTypeId: story.content_type_id,
        contentTypeName: story.content_type_name,
        sourcePlatformId: story.source_platform_id,
        sourcePlatformName: story.source_platform_name,
        subtitle: story.subtitle ?? "",
        imageFile: story.image_file,
        coverAssetId: story.cover_asset_id,
        coverAssetName: story.cover_asset_name,
        imageUrl: story.cover_asset_object_key || story.image_file
          ? revisionedUrl(
              story.cover_asset_object_key
                ? await requirePublicObjectUrl(
                    services.storage!,
                    story.cover_asset_object_key,
                  )
                : await resolvePublicObjectUrl(
                    services.storage!,
                    storyObjectKey(agency.code, idol.folder_name, story.image_file!),
                    wikiStoryImageUrl(
                      agency.name,
                      idol.name_cn,
                      story.image_file,
                    ),
                  ),
              story.cover_asset_revision ?? story.image_media_revision,
            )
          : "",
        cardId: story.card_id,
        imageTransform: storyImageTransform(story),
        mediaRevision: story.image_media_revision,
        revision: story.image_media_revision,
      }))),
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
        wikiUrl: idol.wiki_url,
        textColor: idol.text_color,
        displayOrder: idol.display_order,
        imageUrl: idolImageUrl,
        imageFit: idol.avatar_fit,
        imageTransform: idolImageTransform(idol),
        mediaRevision: idol.avatar_media_revision,
        entryKind: idol.entry_kind,
        entrySubtype: idol.entry_subtype,
      },
      categories: categoryRows.map((category) => ({
        id: category.id,
        name: category.name,
        storageSlug: category.storage_slug,
        displayOrder: category.display_order,
        showWhenEmpty: category.show_when_empty,
        backgroundEligible: category.background_eligible,
        revision: category.revision,
      })),
      contentTypes: contentTypes.map((option) => ({
        id: option.id,
        name: option.name,
        iconName: option.icon_name,
        description: option.description,
        displayOrder: option.display_order,
        isActive: option.is_active,
        revision: option.revision,
      })),
      sourcePlatforms: sourcePlatforms.map((option) => ({
        id: option.id,
        name: option.name,
        homepageUrl: option.homepage_url,
        description: option.description,
        displayOrder: option.display_order,
        isActive: option.is_active,
        revision: option.revision,
      })),
      cards: resolvedCards,
      stories: resolvedStories,
    });
  };
}
