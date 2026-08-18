import type { Env, Hono } from "hono";
import {
  createWikiWriteAuthorization,
  type WikiServicesResolver,
} from "@/domains/content/wiki/handler-support";
import {
  validateCreateWikiContentTypeRequest,
  validateCreateWikiSourcePlatformRequest,
  validateUpdateWikiContentTypeRequest,
  validateUpdateWikiSourcePlatformRequest,
  validateWikiBilibiliRequest,
  validateWikiCardIdParams,
  validateWikiOptionIdParams,
  validateWikiStoriesQuery,
  validateWikiStoryIdParams,
  validateWikiStoryLinkQuery,
  validateWikiStorySourcesRequest,
  wikiValidationErrorBody,
} from "@/domains/content/wiki/request";
import { createHandleAddWikiStorySources } from "@/domains/content/wiki/stories/handlers/add-story-sources";
import { createHandleAddWikiStory } from "@/domains/content/wiki/stories/handlers/add-story";
import { createHandleDeleteWikiStoryLink } from "@/domains/content/wiki/stories/handlers/delete-story-link";
import { createHandleDeleteWikiStory } from "@/domains/content/wiki/stories/handlers/delete-story";
import { createHandleEditWikiStory } from "@/domains/content/wiki/stories/handlers/edit-story";
import { createHandleListAdminWikiStories } from "@/domains/content/wiki/stories/handlers/list-admin-stories";
import { createHandleListPublicWikiStories } from "@/domains/content/wiki/stories/handlers/list-public-stories";
import {
  createHandleCreateWikiStoryCatalogOption,
  createHandleDeleteWikiStoryCatalogOption,
  createHandleListWikiStorySourceCatalog,
  createHandleUpdateWikiStoryCatalogOption,
} from "@/domains/content/wiki/stories/handlers/manage-story-source-catalog";
import { createHandleParseBilibili } from "@/domains/content/wiki/stories/handlers/parse-bilibili";
import { createHandleUpdateWikiStoryCard } from "@/domains/content/wiki/stories/handlers/update-story-card";
import {
  jsonValidator,
  paramValidator,
  queryValidator,
} from "@/middleware/request-validation";

export function registerWikiStoryRoutes<E extends Env>(
  app: Hono<E>,
  resolveServices: WikiServicesResolver<E>,
): void {
  const jsonOptions = {
    malformedMessage: "请求内容不是有效 JSON",
    errorBody: wikiValidationErrorBody,
  };
  const writeAuthorization = createWikiWriteAuthorization(resolveServices);

  app.get(
    "/api/wiki/stories",
    queryValidator(validateWikiStoriesQuery, { errorBody: wikiValidationErrorBody }),
    createHandleListPublicWikiStories(resolveServices),
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
  app.delete(
    "/api/admin/wiki/stories/:storyId",
    paramValidator(validateWikiStoryIdParams, { errorBody: wikiValidationErrorBody }),
    queryValidator(validateWikiStoryLinkQuery, { errorBody: wikiValidationErrorBody }),
    createHandleDeleteWikiStoryLink(resolveServices),
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
  app.post("/api/wiki/add_story", createHandleAddWikiStory(resolveServices));
  app.post("/api/wiki/edit_story", createHandleEditWikiStory(resolveServices));
  app.post(
    "/api/wiki/delete_story",
    createHandleDeleteWikiStory(resolveServices),
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
}
