import type { Env, Hono } from "hono";
import { createHandleAddWikiStorySources } from "@/domains/wiki/handlers/add-story-sources";
import { createHandleAddWikiStory } from "@/domains/wiki/handlers/add-story";
import { createHandleDeleteWikiAgencyIcon } from "@/domains/wiki/handlers/delete-agency-icon";
import { createHandleDeleteWikiCategory } from "@/domains/wiki/handlers/delete-category";
import { createHandleDeleteWikiIdolMedia } from "@/domains/wiki/handlers/delete-idol-media";
import { createHandleDeleteWikiStoryLink } from "@/domains/wiki/handlers/delete-story-link";
import { createHandleDeleteWikiStory } from "@/domains/wiki/handlers/delete-story";
import { createHandleEditWikiStory } from "@/domains/wiki/handlers/edit-story";
import { createHandleListAdminWikiCatalog } from "@/domains/wiki/handlers/list-admin-catalog";
import { createHandleListAdminWikiStories } from "@/domains/wiki/handlers/list-admin-stories";
import { createHandleListPublicWikiCatalog } from "@/domains/wiki/handlers/list-public-catalog";
import { createHandleListPublicWikiStories } from "@/domains/wiki/handlers/list-public-stories";
import { createHandleListWikiIdolMedia } from "@/domains/wiki/handlers/list-idol-media";
import {
  createHandleCreateWikiStoryCoverAsset,
  createHandleDeleteWikiStoryCoverAsset,
  createHandleListWikiStoryCoverAssets,
  createHandleUpdateWikiStoryCoverAsset,
} from "@/domains/wiki/handlers/manage-story-cover-assets";
import {
  createHandleCreateWikiAgency,
  createHandleCreateWikiGroup,
  createHandleCreateWikiIdol,
  createHandleDeleteWikiGroup,
  createHandleDeleteWikiIdol,
  createHandleUpdateWikiAgency,
  createHandleUpdateWikiGroup,
  createHandleUpdateWikiIdol,
} from "@/domains/wiki/handlers/manage-catalog";
import { createHandleParseBilibili } from "@/domains/wiki/handlers/parse-bilibili";
import {
  createHandleCreateWikiStoryCatalogOption,
  createHandleDeleteWikiStoryCatalogOption,
  createHandleListWikiStorySourceCatalog,
  createHandleUpdateWikiStoryCatalogOption,
} from "@/domains/wiki/handlers/manage-story-source-catalog";
import { createHandleRandomWikiBackground } from "@/domains/wiki/handlers/random-background";
import { createHandleRandomWikiIdol } from "@/domains/wiki/handlers/random-idol";
import { handleRejectRetiredWikiStaticAsset } from "@/domains/wiki/handlers/reject-retired-wiki-static-asset";
import { createHandleSaveWikiLayout } from "@/domains/wiki/handlers/save-wiki-layout";
import { createHandleSaveWikiEntityImage } from "@/domains/wiki/handlers/save-entity-image";
import { createHandleServeWikiIdolImage } from "@/domains/wiki/handlers/serve-wiki-idol-image";
import { createHandleServeWikiEntityIcon } from "@/domains/wiki/handlers/serve-wiki-entity-icon";
import { createHandleServeWikiStoryCoverAsset } from "@/domains/wiki/handlers/serve-story-cover-asset";
import { handleWikiTest } from "@/domains/wiki/handlers/wiki-test";
import { createHandleUploadWikiAgencyIcon } from "@/domains/wiki/handlers/upload-agency-icon";
import { createHandleUploadWikiIdolMedia } from "@/domains/wiki/handlers/upload-idol-media";
import {
  createHandleCreateWikiCategory,
  createHandleUpdateWikiCategory,
} from "@/domains/wiki/handlers/update-category";
import { createHandleUpdateWikiStoryCard } from "@/domains/wiki/handlers/update-story-card";
import {
  createWikiAdminAuthorization,
  createWikiWriteAuthorization,
  type WikiServicesResolver,
} from "@/domains/wiki/handler-support";
import {
  jsonValidator,
  paramValidator,
  queryValidator,
} from "@/middleware/request-validation";
import {
  validateCreateWikiAgencyRequest,
  validateCreateWikiCategoryRequest,
  validateCreateWikiContentTypeRequest,
  validateCreateWikiGroupRequest,
  validateCreateWikiIdolRequest,
  validateCreateWikiSourcePlatformRequest,
  validateDeleteWikiAgencyIconRequest,
  validateDeleteWikiIdolMediaRequest,
  validateUpdateWikiAgencyRequest,
  validateUpdateWikiCategoryRequest,
  validateUpdateWikiContentTypeRequest,
  validateUpdateWikiGroupRequest,
  validateUpdateWikiIdolRequest,
  validateUpdateWikiSourcePlatformRequest,
  validateWikiAssetParams,
  validateWikiAgencyIdParams,
  validateWikiAssetIdParams,
  validateWikiBilibiliRequest,
  validateWikiCardIdParams,
  validateWikiCatalogQuery,
  validateWikiCategoryCreateParams,
  validateWikiCategoryIdParams,
  validateWikiGroupIdParams,
  validateWikiIdolIdParams,
  validateWikiLayoutRequest,
  validateWikiMediaAgencyIdParams,
  validateWikiMediaGroupIdParams,
  validateWikiMediaIdolIdParams,
  validateWikiOptionIdParams,
  validateWikiRevisionRequest,
  validateWikiStoriesQuery,
  validateWikiStoryIdParams,
  validateWikiStoryLinkQuery,
  validateWikiStorySourcesRequest,
  wikiValidationErrorBody,
} from "@/domains/wiki/request";

export type { WikiServicesResolver } from "@/domains/wiki/handler-support";

export function registerWikiRoutes<E extends Env>(
  app: Hono<E>,
  resolveServices: WikiServicesResolver<E>,
): void {
  const jsonOptions = {
    malformedMessage: "请求内容不是有效 JSON",
    errorBody: wikiValidationErrorBody,
  };
  const assetParam = paramValidator(validateWikiAssetParams, {
    errorBody: wikiValidationErrorBody,
  });
  const writeAuthorization = createWikiWriteAuthorization(resolveServices);

  app.use("/api/admin/wiki/*", createWikiAdminAuthorization(resolveServices));

  app.get("/api/wiki/test", handleWikiTest);
  app.on(
    ["GET", "HEAD"],
    "/icon/agencies/:asset",
    assetParam,
    createHandleServeWikiEntityIcon(resolveServices, "agency"),
  );
  app.on(
    ["GET", "HEAD"],
    "/icon/wiki-groups/:asset",
    assetParam,
    createHandleServeWikiEntityIcon(resolveServices, "group"),
  );
  app.on(["GET", "HEAD"], "/icon/*", handleRejectRetiredWikiStaticAsset);
  app.on(
    ["GET", "HEAD"],
    "/api/wiki/story-cover-assets/:asset",
    assetParam,
    createHandleServeWikiStoryCoverAsset(resolveServices),
  );
  app.on(["GET", "HEAD"], "/css/*", handleRejectRetiredWikiStaticAsset);
  app.on(
    ["GET", "HEAD"],
    "/image/:agency/:idol/*",
    createHandleServeWikiIdolImage(resolveServices),
  );
  app.get(
    "/api/wiki/catalog",
    queryValidator(validateWikiCatalogQuery, { errorBody: wikiValidationErrorBody }),
    createHandleListPublicWikiCatalog(resolveServices),
  );
  app.get(
    "/api/wiki/stories",
    queryValidator(validateWikiStoriesQuery, { errorBody: wikiValidationErrorBody }),
    createHandleListPublicWikiStories(resolveServices),
  );
  app.get(
    "/api/admin/wiki/catalog",
    createHandleListAdminWikiCatalog(resolveServices),
  );
  app.get(
    "/api/admin/wiki/stories",
    queryValidator(validateWikiStoriesQuery, { errorBody: wikiValidationErrorBody }),
    createHandleListAdminWikiStories(resolveServices),
  );
  app.get(
    "/api/admin/wiki/story-source-catalog",
    createHandleListWikiStorySourceCatalog(resolveServices),
  );
  app.get(
    "/api/admin/wiki/agencies/:agencyId/story-cover-assets",
    paramValidator(validateWikiAgencyIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleListWikiStoryCoverAssets(resolveServices),
  );
  app.post(
    "/api/admin/wiki/agencies/:agencyId/story-cover-assets",
    paramValidator(validateWikiAgencyIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleCreateWikiStoryCoverAsset(resolveServices),
  );
  app.patch(
    "/api/admin/wiki/story-cover-assets/:assetId",
    paramValidator(validateWikiAssetIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleUpdateWikiStoryCoverAsset(resolveServices),
  );
  app.delete(
    "/api/admin/wiki/story-cover-assets/:assetId",
    paramValidator(validateWikiAssetIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleDeleteWikiStoryCoverAsset(resolveServices),
  );
  app.post(
    "/api/admin/wiki/story-content-types",
    jsonValidator(validateCreateWikiContentTypeRequest, jsonOptions),
    createHandleCreateWikiStoryCatalogOption(resolveServices, "content-type"),
  );
  app.patch(
    "/api/admin/wiki/story-content-types/:optionId",
    paramValidator(validateWikiOptionIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateUpdateWikiContentTypeRequest, jsonOptions),
    createHandleUpdateWikiStoryCatalogOption(resolveServices, "content-type"),
  );
  app.delete(
    "/api/admin/wiki/story-content-types/:optionId",
    paramValidator(validateWikiOptionIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleDeleteWikiStoryCatalogOption(resolveServices, "content-type"),
  );
  app.post(
    "/api/admin/wiki/story-source-platforms",
    jsonValidator(validateCreateWikiSourcePlatformRequest, jsonOptions),
    createHandleCreateWikiStoryCatalogOption(
      resolveServices,
      "source-platform",
    ),
  );
  app.patch(
    "/api/admin/wiki/story-source-platforms/:optionId",
    paramValidator(validateWikiOptionIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateUpdateWikiSourcePlatformRequest, jsonOptions),
    createHandleUpdateWikiStoryCatalogOption(
      resolveServices,
      "source-platform",
    ),
  );
  app.delete(
    "/api/admin/wiki/story-source-platforms/:optionId",
    paramValidator(validateWikiOptionIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleDeleteWikiStoryCatalogOption(
      resolveServices,
      "source-platform",
    ),
  );
  app.post(
    "/api/admin/wiki/agencies",
    jsonValidator(validateCreateWikiAgencyRequest, jsonOptions),
    createHandleCreateWikiAgency(resolveServices),
  );
  app.patch(
    "/api/admin/wiki/agencies/:agencyId",
    paramValidator(validateWikiAgencyIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateUpdateWikiAgencyRequest, jsonOptions),
    createHandleUpdateWikiAgency(resolveServices),
  );
  app.post(
    "/api/admin/wiki/agencies/:agencyId/groups",
    paramValidator(validateWikiAgencyIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateCreateWikiGroupRequest, jsonOptions),
    createHandleCreateWikiGroup(resolveServices),
  );
  app.patch(
    "/api/admin/wiki/groups/:groupId",
    paramValidator(validateWikiGroupIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateUpdateWikiGroupRequest, jsonOptions),
    createHandleUpdateWikiGroup(resolveServices),
  );
  app.delete(
    "/api/admin/wiki/groups/:groupId",
    paramValidator(validateWikiGroupIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateWikiRevisionRequest, jsonOptions),
    createHandleDeleteWikiGroup(resolveServices),
  );
  app.post(
    "/api/admin/wiki/agencies/:agencyId/idols",
    paramValidator(validateWikiAgencyIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateCreateWikiIdolRequest, jsonOptions),
    createHandleCreateWikiIdol(resolveServices),
  );
  app.patch(
    "/api/admin/wiki/idols/:idolId",
    paramValidator(validateWikiIdolIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateUpdateWikiIdolRequest, jsonOptions),
    createHandleUpdateWikiIdol(resolveServices),
  );
  app.delete(
    "/api/admin/wiki/idols/:idolId",
    paramValidator(validateWikiIdolIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateWikiRevisionRequest, jsonOptions),
    createHandleDeleteWikiIdol(resolveServices),
  );
  app.put(
    "/api/admin/wiki/agencies/:agencyId/icon",
    paramValidator(validateWikiMediaAgencyIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleSaveWikiEntityImage(resolveServices, "agency", "agencyId"),
  );
  app.delete(
    "/api/admin/wiki/stories/:storyId",
    paramValidator(validateWikiStoryIdParams, { errorBody: wikiValidationErrorBody }),
    queryValidator(validateWikiStoryLinkQuery, { errorBody: wikiValidationErrorBody }),
    createHandleDeleteWikiStoryLink(resolveServices),
  );
  app.patch(
    "/api/admin/wiki/categories/:categoryId",
    paramValidator(validateWikiCategoryIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateUpdateWikiCategoryRequest, jsonOptions),
    createHandleUpdateWikiCategory(resolveServices),
  );
  app.post(
    "/api/admin/wiki/agencies/:agencyId/idols/:idolId/categories",
    paramValidator(validateWikiCategoryCreateParams, {
      errorBody: wikiValidationErrorBody,
    }),
    jsonValidator(validateCreateWikiCategoryRequest, jsonOptions),
    createHandleCreateWikiCategory(resolveServices),
  );
  app.patch(
    "/api/admin/wiki/cards/:cardId",
    paramValidator(validateWikiCardIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleUpdateWikiStoryCard(resolveServices),
  );
  app.post(
    "/api/admin/wiki/cards/:cardId/sources",
    paramValidator(validateWikiCardIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateWikiStorySourcesRequest, jsonOptions),
    createHandleAddWikiStorySources(resolveServices),
  );
  app.put(
    "/api/admin/wiki/groups/:groupId/icon",
    paramValidator(validateWikiMediaGroupIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleSaveWikiEntityImage(resolveServices, "group", "groupId"),
  );
  app.put(
    "/api/admin/wiki/idols/:idolId/avatar",
    paramValidator(validateWikiMediaIdolIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleSaveWikiEntityImage(resolveServices, "idol", "idolId"),
  );
  app.get(
    "/api/wiki/idol-media",
    createHandleListWikiIdolMedia(resolveServices),
  );
  app.post(
    "/api/wiki/agency-icon",
    createHandleUploadWikiAgencyIcon(resolveServices),
  );
  app.delete(
    "/api/wiki/agency-icon",
    writeAuthorization,
    jsonValidator(validateDeleteWikiAgencyIconRequest, jsonOptions),
    createHandleDeleteWikiAgencyIcon(resolveServices),
  );
  app.post(
    "/api/wiki/idol-media",
    createHandleUploadWikiIdolMedia(resolveServices),
  );
  app.delete(
    "/api/wiki/idol-media",
    writeAuthorization,
    jsonValidator(validateDeleteWikiIdolMediaRequest, jsonOptions),
    createHandleDeleteWikiIdolMedia(resolveServices),
  );
  app.post("/api/wiki/add_story", createHandleAddWikiStory(resolveServices));
  app.post("/api/wiki/edit_story", createHandleEditWikiStory(resolveServices));
  app.post(
    "/api/wiki/delete_story",
    createHandleDeleteWikiStory(resolveServices),
  );
  app.post(
    "/api/wiki/delete_category",
    createHandleDeleteWikiCategory(resolveServices),
  );
  app.post(
    "/api/wiki/parse_bilibili",
    writeAuthorization,
    jsonValidator(validateWikiBilibiliRequest, {
      ...jsonOptions,
      acceptMislabeledJson: true,
    }),
    createHandleParseBilibili(resolveServices),
  );
  app.put(
    "/api/admin/wiki/agencies/:agencyId/layout",
    paramValidator(validateWikiAgencyIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateWikiLayoutRequest, jsonOptions),
    createHandleSaveWikiLayout(resolveServices),
  );
  app.get(
    "/api/wiki/random_bg",
    createHandleRandomWikiBackground(resolveServices),
  );
  app.get("/api/wiki/random_idol", createHandleRandomWikiIdol(resolveServices));
}
