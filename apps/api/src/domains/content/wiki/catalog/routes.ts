import { adminWikiPath, wikiPath } from '@imsweb/contracts/paths';
import {
  createWikiAgencyRequestSchema,
  createWikiCategoryRequestSchema,
  createWikiGroupRequestSchema,
  createWikiIdolRequestSchema,
  updateWikiAgencyRequestSchema,
  updateWikiCategoryRequestSchema,
  updateWikiGroupRequestSchema,
  updateWikiIdolRequestSchema,
  wikiAgencyIdParamsSchema,
  wikiCatalogQuerySchema,
  wikiCategoryCreateParamsSchema,
  wikiCategoryIdParamsSchema,
  wikiGroupIdParamsSchema,
  wikiIdolIdParamsSchema,
  wikiLayoutRequestSchema,
  wikiRevisionRequestSchema,
} from '@imsweb/contracts/wiki';
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
  jsonSchemaValidator,
  paramSchemaValidator,
  querySchemaValidator,
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
    querySchemaValidator(wikiCatalogQuerySchema, { errorBody: wikiValidationErrorBody }, validateWikiCatalogQuery),
    createHandleListPublicWikiCatalog(resolveServices),
  );
  app.get(
    adminWikiPath('/catalog'),
    createHandleListAdminWikiCatalog(resolveServices),
  );
  app.post(
    adminWikiPath('/agencies'),
    jsonSchemaValidator(createWikiAgencyRequestSchema, jsonOptions, validateCreateWikiAgencyRequest),
    createHandleCreateWikiAgency(resolveServices),
  );
  app.patch(
    adminWikiPath('/agencies/:agencyId'),
    paramSchemaValidator(wikiAgencyIdParamsSchema, { errorBody: wikiValidationErrorBody }, validateWikiAgencyIdParams),
    jsonSchemaValidator(updateWikiAgencyRequestSchema, jsonOptions, validateUpdateWikiAgencyRequest),
    createHandleUpdateWikiAgency(resolveServices),
  );
  app.post(
    adminWikiPath('/agencies/:agencyId/groups'),
    paramSchemaValidator(wikiAgencyIdParamsSchema, { errorBody: wikiValidationErrorBody }, validateWikiAgencyIdParams),
    jsonSchemaValidator(createWikiGroupRequestSchema, jsonOptions, validateCreateWikiGroupRequest),
    createHandleCreateWikiGroup(resolveServices),
  );
  app.patch(
    adminWikiPath('/groups/:groupId'),
    paramSchemaValidator(wikiGroupIdParamsSchema, { errorBody: wikiValidationErrorBody }, validateWikiGroupIdParams),
    jsonSchemaValidator(updateWikiGroupRequestSchema, jsonOptions, validateUpdateWikiGroupRequest),
    createHandleUpdateWikiGroup(resolveServices),
  );
  app.delete(
    adminWikiPath('/groups/:groupId'),
    paramSchemaValidator(wikiGroupIdParamsSchema, { errorBody: wikiValidationErrorBody }, validateWikiGroupIdParams),
    jsonSchemaValidator(wikiRevisionRequestSchema, jsonOptions, validateWikiRevisionRequest),
    createHandleDeleteWikiGroup(resolveServices),
  );
  app.post(
    adminWikiPath('/agencies/:agencyId/idols'),
    paramSchemaValidator(wikiAgencyIdParamsSchema, { errorBody: wikiValidationErrorBody }, validateWikiAgencyIdParams),
    jsonSchemaValidator(createWikiIdolRequestSchema, jsonOptions, validateCreateWikiIdolRequest),
    createHandleCreateWikiIdol(resolveServices),
  );
  app.patch(
    adminWikiPath('/idols/:idolId'),
    paramSchemaValidator(wikiIdolIdParamsSchema, { errorBody: wikiValidationErrorBody }, validateWikiIdolIdParams),
    jsonSchemaValidator(updateWikiIdolRequestSchema, jsonOptions, validateUpdateWikiIdolRequest),
    createHandleUpdateWikiIdol(resolveServices),
  );
  app.delete(
    adminWikiPath('/idols/:idolId'),
    paramSchemaValidator(wikiIdolIdParamsSchema, { errorBody: wikiValidationErrorBody }, validateWikiIdolIdParams),
    jsonSchemaValidator(wikiRevisionRequestSchema, jsonOptions, validateWikiRevisionRequest),
    createHandleDeleteWikiIdol(resolveServices),
  );
  app.patch(
    adminWikiPath('/categories/:categoryId'),
    paramSchemaValidator(wikiCategoryIdParamsSchema, { errorBody: wikiValidationErrorBody }, validateWikiCategoryIdParams),
    jsonSchemaValidator(updateWikiCategoryRequestSchema, jsonOptions, validateUpdateWikiCategoryRequest),
    createHandleUpdateWikiCategory(resolveServices),
  );
  app.post(
    adminWikiPath('/agencies/:agencyId/idols/:idolId/categories'),
    paramSchemaValidator(wikiCategoryCreateParamsSchema, {
      errorBody: wikiValidationErrorBody,
    }, validateWikiCategoryCreateParams),
    jsonSchemaValidator(createWikiCategoryRequestSchema, jsonOptions, validateCreateWikiCategoryRequest),
    createHandleCreateWikiCategory(resolveServices),
  );
  app.post(
    wikiPath('/delete_category'),
    createHandleDeleteWikiCategory(resolveServices),
  );
  app.put(
    adminWikiPath('/agencies/:agencyId/layout'),
    paramSchemaValidator(wikiAgencyIdParamsSchema, { errorBody: wikiValidationErrorBody }, validateWikiAgencyIdParams),
    jsonSchemaValidator(wikiLayoutRequestSchema, jsonOptions, validateWikiLayoutRequest),
    createHandleSaveWikiLayout(resolveServices),
  );
  app.get(
    wikiPath('/random_bg'),
    createHandleRandomWikiBackground(resolveServices),
  );
  app.get(wikiPath('/random_idol'), createHandleRandomWikiIdol(resolveServices));
}
