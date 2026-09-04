import { adminWikiPath, wikiPath } from '@imsweb/contracts/paths';
import type { Env, Hono } from "hono";
import { createHandleDeleteWikiCategory } from "@/domains/content/wiki/catalog/handlers/delete-category";
import { createHandleListAdminWikiCatalog } from "@/domains/content/wiki/catalog/handlers/list-admin-catalog";
import { createHandleListPublicWikiCatalog } from "@/domains/content/wiki/catalog/handlers/list-public-catalog";
import {
  createHandleCreateWikiAgency,
  createHandleCreateWikiGroup,
  createHandleCreateWikiIdol,
  createHandleDeleteWikiGroup,
  createHandleDeleteWikiIdol,
  createHandleUpdateWikiAgency,
  createHandleUpdateWikiGroup,
  createHandleUpdateWikiIdol,
} from "@/domains/content/wiki/catalog/handlers/manage-catalog";
import { createHandleRandomWikiBackground } from "@/domains/content/wiki/catalog/handlers/random-background";
import { createHandleRandomWikiIdol } from "@/domains/content/wiki/catalog/handlers/random-idol";
import { createHandleSaveWikiLayout } from "@/domains/content/wiki/catalog/handlers/save-wiki-layout";
import {
  createHandleCreateWikiCategory,
  createHandleUpdateWikiCategory,
} from "@/domains/content/wiki/catalog/handlers/update-category";
import { handleWikiTest } from "@/domains/content/wiki/catalog/handlers/wiki-test";
import type { WikiServicesResolver } from "@/domains/content/wiki/handler-support";
import {
  validateCreateWikiAgencyRequest,
  validateCreateWikiCategoryRequest,
  validateCreateWikiGroupRequest,
  validateCreateWikiIdolRequest,
  validateUpdateWikiAgencyRequest,
  validateUpdateWikiCategoryRequest,
  validateUpdateWikiGroupRequest,
  validateUpdateWikiIdolRequest,
  validateWikiAgencyIdParams,
  validateWikiCatalogQuery,
  validateWikiCategoryCreateParams,
  validateWikiCategoryIdParams,
  validateWikiGroupIdParams,
  validateWikiIdolIdParams,
  validateWikiLayoutRequest,
  validateWikiRevisionRequest,
  wikiValidationErrorBody,
} from "@/domains/content/wiki/request";
import {
  jsonValidator,
  paramValidator,
  queryValidator,
} from "@/middleware/request-validation";

export function registerWikiCatalogRoutes<E extends Env>(
  app: Hono<E>,
  resolveServices: WikiServicesResolver<E>,
): void {
  const jsonOptions = {
    malformedMessage: "请求内容不是有效 JSON",
    errorBody: wikiValidationErrorBody,
  };

  app.get(wikiPath('/test'), handleWikiTest);
  app.get(
    wikiPath('/catalog'),
    queryValidator(validateWikiCatalogQuery, { errorBody: wikiValidationErrorBody }),
    createHandleListPublicWikiCatalog(resolveServices),
  );
  app.get(
    adminWikiPath('/catalog'),
    createHandleListAdminWikiCatalog(resolveServices),
  );
  app.post(
    adminWikiPath('/agencies'),
    jsonValidator(validateCreateWikiAgencyRequest, jsonOptions),
    createHandleCreateWikiAgency(resolveServices),
  );
  app.patch(
    adminWikiPath('/agencies/:agencyId'),
    paramValidator(validateWikiAgencyIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateUpdateWikiAgencyRequest, jsonOptions),
    createHandleUpdateWikiAgency(resolveServices),
  );
  app.post(
    adminWikiPath('/agencies/:agencyId/groups'),
    paramValidator(validateWikiAgencyIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateCreateWikiGroupRequest, jsonOptions),
    createHandleCreateWikiGroup(resolveServices),
  );
  app.patch(
    adminWikiPath('/groups/:groupId'),
    paramValidator(validateWikiGroupIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateUpdateWikiGroupRequest, jsonOptions),
    createHandleUpdateWikiGroup(resolveServices),
  );
  app.delete(
    adminWikiPath('/groups/:groupId'),
    paramValidator(validateWikiGroupIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateWikiRevisionRequest, jsonOptions),
    createHandleDeleteWikiGroup(resolveServices),
  );
  app.post(
    adminWikiPath('/agencies/:agencyId/idols'),
    paramValidator(validateWikiAgencyIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateCreateWikiIdolRequest, jsonOptions),
    createHandleCreateWikiIdol(resolveServices),
  );
  app.patch(
    adminWikiPath('/idols/:idolId'),
    paramValidator(validateWikiIdolIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateUpdateWikiIdolRequest, jsonOptions),
    createHandleUpdateWikiIdol(resolveServices),
  );
  app.delete(
    adminWikiPath('/idols/:idolId'),
    paramValidator(validateWikiIdolIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateWikiRevisionRequest, jsonOptions),
    createHandleDeleteWikiIdol(resolveServices),
  );
  app.patch(
    adminWikiPath('/categories/:categoryId'),
    paramValidator(validateWikiCategoryIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateUpdateWikiCategoryRequest, jsonOptions),
    createHandleUpdateWikiCategory(resolveServices),
  );
  app.post(
    adminWikiPath('/agencies/:agencyId/idols/:idolId/categories'),
    paramValidator(validateWikiCategoryCreateParams, {
      errorBody: wikiValidationErrorBody,
    }),
    jsonValidator(validateCreateWikiCategoryRequest, jsonOptions),
    createHandleCreateWikiCategory(resolveServices),
  );
  app.post(
    wikiPath('/delete_category'),
    createHandleDeleteWikiCategory(resolveServices),
  );
  app.put(
    adminWikiPath('/agencies/:agencyId/layout'),
    paramValidator(validateWikiAgencyIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateWikiLayoutRequest, jsonOptions),
    createHandleSaveWikiLayout(resolveServices),
  );
  app.get(
    wikiPath('/random_bg'),
    createHandleRandomWikiBackground(resolveServices),
  );
  app.get(wikiPath('/random_idol'), createHandleRandomWikiIdol(resolveServices));
}
