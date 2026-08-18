import { adminWikiPath, wikiPath } from '@imsweb/contracts/paths';
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
    wikiPath('/stories'),
    queryValidator(validateWikiStoriesQuery, { errorBody: wikiValidationErrorBody }),
    createHandleListPublicWikiStories(resolveServices),
  );
  app.get(
    adminWikiPath('/stories'),
    queryValidator(validateWikiStoriesQuery, { errorBody: wikiValidationErrorBody }),
    createHandleListAdminWikiStories(resolveServices),
  );
  app.get(
    adminWikiPath('/story-source-catalog'),
    createHandleListWikiStorySourceCatalog(resolveServices),
  );
  app.post(
    adminWikiPath('/story-content-types'),
    jsonValidator(validateCreateWikiContentTypeRequest, jsonOptions),
    createHandleCreateWikiStoryCatalogOption(resolveServices, "content-type"),
  );
  app.patch(
    adminWikiPath('/story-content-types/:optionId'),
    paramValidator(validateWikiOptionIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateUpdateWikiContentTypeRequest, jsonOptions),
    createHandleUpdateWikiStoryCatalogOption(resolveServices, "content-type"),
  );
  app.delete(
    adminWikiPath('/story-content-types/:optionId'),
    paramValidator(validateWikiOptionIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleDeleteWikiStoryCatalogOption(resolveServices, "content-type"),
  );
  app.post(
    adminWikiPath('/story-source-platforms'),
    jsonValidator(validateCreateWikiSourcePlatformRequest, jsonOptions),
    createHandleCreateWikiStoryCatalogOption(
      resolveServices,
      "source-platform",
    ),
  );
  app.patch(
    adminWikiPath('/story-source-platforms/:optionId'),
    paramValidator(validateWikiOptionIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateUpdateWikiSourcePlatformRequest, jsonOptions),
    createHandleUpdateWikiStoryCatalogOption(
      resolveServices,
      "source-platform",
    ),
  );
  app.delete(
    adminWikiPath('/story-source-platforms/:optionId'),
    paramValidator(validateWikiOptionIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleDeleteWikiStoryCatalogOption(
      resolveServices,
      "source-platform",
    ),
  );
  app.delete(
    adminWikiPath('/stories/:storyId'),
    paramValidator(validateWikiStoryIdParams, { errorBody: wikiValidationErrorBody }),
    queryValidator(validateWikiStoryLinkQuery, { errorBody: wikiValidationErrorBody }),
    createHandleDeleteWikiStoryLink(resolveServices),
  );
  app.patch(
    adminWikiPath('/cards/:cardId'),
    paramValidator(validateWikiCardIdParams, { errorBody: wikiValidationErrorBody }),
    createHandleUpdateWikiStoryCard(resolveServices),
  );
  app.post(
    adminWikiPath('/cards/:cardId/sources'),
    paramValidator(validateWikiCardIdParams, { errorBody: wikiValidationErrorBody }),
    jsonValidator(validateWikiStorySourcesRequest, jsonOptions),
    createHandleAddWikiStorySources(resolveServices),
  );
  app.post(wikiPath('/add_story'), createHandleAddWikiStory(resolveServices));
  app.post(wikiPath('/edit_story'), createHandleEditWikiStory(resolveServices));
  app.post(
    wikiPath('/delete_story'),
    createHandleDeleteWikiStory(resolveServices),
  );
  app.post(
    wikiPath('/parse_bilibili'),
    writeAuthorization,
    jsonValidator(validateWikiBilibiliRequest, {
      ...jsonOptions,
      acceptMislabeledJson: true,
    }),
    createHandleParseBilibili(resolveServices),
  );
}
