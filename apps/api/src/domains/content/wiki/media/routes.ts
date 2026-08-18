import {
  adminWikiPath,
  cssPath,
  iconPath,
  imagePath,
  wikiPath,
} from '@imsweb/contracts/paths';
import type { Env, Hono } from "hono";
import {
  createWikiWriteAuthorization,
  type WikiServicesResolver,
} from "@/domains/content/wiki/handler-support";
import { createHandleDeleteWikiAgencyIcon } from "@/domains/content/wiki/media/handlers/delete-agency-icon";
import { createHandleDeleteWikiIdolMedia } from "@/domains/content/wiki/media/handlers/delete-idol-media";
import { createHandleListWikiIdolMedia } from "@/domains/content/wiki/media/handlers/list-idol-media";
import {
  createHandleCreateWikiStoryCoverAsset,
  createHandleDeleteWikiStoryCoverAsset,
  createHandleListWikiStoryCoverAssets,
  createHandleUpdateWikiStoryCoverAsset,
} from "@/domains/content/wiki/media/handlers/manage-story-cover-assets";
import { handleRejectRetiredWikiStaticAsset } from "@/domains/content/wiki/media/handlers/reject-retired-wiki-static-asset";
import { createHandleSaveWikiEntityImage } from "@/domains/content/wiki/media/handlers/save-entity-image";
import { createHandleServeWikiStoryCoverAsset } from "@/domains/content/wiki/media/handlers/serve-story-cover-asset";
import { createHandleServeWikiEntityIcon } from "@/domains/content/wiki/media/handlers/serve-wiki-entity-icon";
import { createHandleServeWikiIdolImage } from "@/domains/content/wiki/media/handlers/serve-wiki-idol-image";
import { createHandleUploadWikiAgencyIcon } from "@/domains/content/wiki/media/handlers/upload-agency-icon";
import { createHandleUploadWikiIdolMedia } from "@/domains/content/wiki/media/handlers/upload-idol-media";
import {
  validateDeleteWikiAgencyIconRequest,
  validateDeleteWikiIdolMediaRequest,
  validateWikiAssetIdParams,
  validateWikiAssetParams,
  validateWikiAgencyIdParams,
  validateWikiMediaAgencyIdParams,
  validateWikiMediaGroupIdParams,
  validateWikiMediaIdolIdParams,
  wikiValidationErrorBody,
} from "@/domains/content/wiki/request";
import { jsonValidator, paramValidator } from "@/middleware/request-validation";

export function registerWikiMediaRoutes<E extends Env>(
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

  app.on(
    ["GET", "HEAD"],
    iconPath('/agencies/:asset'),
    assetParam,
    createHandleServeWikiEntityIcon(resolveServices, "agency"),
  );
  app.on(
    ["GET", "HEAD"],
    iconPath('/wiki-groups/:asset'),
    assetParam,
    createHandleServeWikiEntityIcon(resolveServices, "group"),
  );
  app.on(["GET", "HEAD"], iconPath('/*'), handleRejectRetiredWikiStaticAsset);
  app.on(
    ["GET", "HEAD"],
    wikiPath('/story-cover-assets/:asset'),
    assetParam,
    createHandleServeWikiStoryCoverAsset(resolveServices),
  );
  app.on(["GET", "HEAD"], cssPath('/*'), handleRejectRetiredWikiStaticAsset);
  app.on(
    ["GET", "HEAD"],
    imagePath('/:agency/:idol/*'),
    createHandleServeWikiIdolImage(resolveServices),
  );
  app.get(
    adminWikiPath('/agencies/:agencyId/story-cover-assets'),
    paramValidator(validateWikiAgencyIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleListWikiStoryCoverAssets(resolveServices),
  );
  app.post(
    adminWikiPath('/agencies/:agencyId/story-cover-assets'),
    paramValidator(validateWikiAgencyIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleCreateWikiStoryCoverAsset(resolveServices),
  );
  app.patch(
    adminWikiPath('/story-cover-assets/:assetId'),
    paramValidator(validateWikiAssetIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleUpdateWikiStoryCoverAsset(resolveServices),
  );
  app.delete(
    adminWikiPath('/story-cover-assets/:assetId'),
    paramValidator(validateWikiAssetIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleDeleteWikiStoryCoverAsset(resolveServices),
  );
  app.put(
    adminWikiPath('/agencies/:agencyId/icon'),
    paramValidator(validateWikiMediaAgencyIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleSaveWikiEntityImage(resolveServices, "agency", "agencyId"),
  );
  app.put(
    adminWikiPath('/groups/:groupId/icon'),
    paramValidator(validateWikiMediaGroupIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleSaveWikiEntityImage(resolveServices, "group", "groupId"),
  );
  app.put(
    adminWikiPath('/idols/:idolId/avatar'),
    paramValidator(validateWikiMediaIdolIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleSaveWikiEntityImage(resolveServices, "idol", "idolId"),
  );
  app.get(
    wikiPath('/idol-media'),
    createHandleListWikiIdolMedia(resolveServices),
  );
  app.post(
    wikiPath('/agency-icon'),
    createHandleUploadWikiAgencyIcon(resolveServices),
  );
  app.delete(
    wikiPath('/agency-icon'),
    writeAuthorization,
    jsonValidator(validateDeleteWikiAgencyIconRequest, jsonOptions),
    createHandleDeleteWikiAgencyIcon(resolveServices),
  );
  app.post(
    wikiPath('/idol-media'),
    createHandleUploadWikiIdolMedia(resolveServices),
  );
  app.delete(
    wikiPath('/idol-media'),
    writeAuthorization,
    jsonValidator(validateDeleteWikiIdolMediaRequest, jsonOptions),
    createHandleDeleteWikiIdolMedia(resolveServices),
  );
}
