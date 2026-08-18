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

  app.get("/api/wiki/test", handleWikiTest);
  app.get(
    "/api/wiki/catalog",
    queryValidator(validateWikiCatalogQuery, { errorBody: wikiValidationErrorBody }),
    createHandleListPublicWikiCatalog(resolveServices),
  );
  app.get(
    "/api/admin/wiki/catalog",
    createHandleListAdminWikiCatalog(resolveServices),
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
  app.post(
    "/api/wiki/delete_category",
    createHandleDeleteWikiCategory(resolveServices),
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
