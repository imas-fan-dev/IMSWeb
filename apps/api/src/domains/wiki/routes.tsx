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
import type { WikiServicesResolver } from "@/domains/wiki/handler-support";

export type { WikiServicesResolver } from "@/domains/wiki/handler-support";

export function registerWikiRoutes<E extends Env>(
  app: Hono<E>,
  resolveServices: WikiServicesResolver<E>,
): void {
  app.get("/api/wiki/test", handleWikiTest);
  app.on(
    ["GET", "HEAD"],
    "/icon/agencies/:asset",
    createHandleServeWikiEntityIcon(resolveServices, "agency"),
  );
  app.on(
    ["GET", "HEAD"],
    "/icon/wiki-groups/:asset",
    createHandleServeWikiEntityIcon(resolveServices, "group"),
  );
  app.on(["GET", "HEAD"], "/icon/*", handleRejectRetiredWikiStaticAsset);
  app.on(
    ["GET", "HEAD"],
    "/api/wiki/story-cover-assets/:asset",
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
    createHandleListPublicWikiCatalog(resolveServices),
  );
  app.get(
    "/api/wiki/stories",
    createHandleListPublicWikiStories(resolveServices),
  );
  app.get(
    "/api/admin/wiki/catalog",
    createHandleListAdminWikiCatalog(resolveServices),
  );
  app.get(
    "/api/admin/wiki/stories",
    createHandleListAdminWikiStories(resolveServices),
  );
  app.get(
    "/api/admin/wiki/story-source-catalog",
    createHandleListWikiStorySourceCatalog(resolveServices),
  );
  app.get(
    "/api/admin/wiki/agencies/:agencyId/story-cover-assets",
    createHandleListWikiStoryCoverAssets(resolveServices),
  );
  app.post(
    "/api/admin/wiki/agencies/:agencyId/story-cover-assets",
    createHandleCreateWikiStoryCoverAsset(resolveServices),
  );
  app.patch(
    "/api/admin/wiki/story-cover-assets/:assetId",
    createHandleUpdateWikiStoryCoverAsset(resolveServices),
  );
  app.delete(
    "/api/admin/wiki/story-cover-assets/:assetId",
    createHandleDeleteWikiStoryCoverAsset(resolveServices),
  );
  app.post(
    "/api/admin/wiki/story-content-types",
    createHandleCreateWikiStoryCatalogOption(resolveServices, "content-type"),
  );
  app.patch(
    "/api/admin/wiki/story-content-types/:optionId",
    createHandleUpdateWikiStoryCatalogOption(resolveServices, "content-type"),
  );
  app.delete(
    "/api/admin/wiki/story-content-types/:optionId",
    createHandleDeleteWikiStoryCatalogOption(resolveServices, "content-type"),
  );
  app.post(
    "/api/admin/wiki/story-source-platforms",
    createHandleCreateWikiStoryCatalogOption(resolveServices, "source-platform"),
  );
  app.patch(
    "/api/admin/wiki/story-source-platforms/:optionId",
    createHandleUpdateWikiStoryCatalogOption(resolveServices, "source-platform"),
  );
  app.delete(
    "/api/admin/wiki/story-source-platforms/:optionId",
    createHandleDeleteWikiStoryCatalogOption(resolveServices, "source-platform"),
  );
  app.post(
    "/api/admin/wiki/agencies",
    createHandleCreateWikiAgency(resolveServices),
  );
  app.patch(
    "/api/admin/wiki/agencies/:agencyId",
    createHandleUpdateWikiAgency(resolveServices),
  );
  app.post(
    "/api/admin/wiki/agencies/:agencyId/groups",
    createHandleCreateWikiGroup(resolveServices),
  );
  app.patch(
    "/api/admin/wiki/groups/:groupId",
    createHandleUpdateWikiGroup(resolveServices),
  );
  app.delete(
    "/api/admin/wiki/groups/:groupId",
    createHandleDeleteWikiGroup(resolveServices),
  );
  app.post(
    "/api/admin/wiki/agencies/:agencyId/idols",
    createHandleCreateWikiIdol(resolveServices),
  );
  app.patch(
    "/api/admin/wiki/idols/:idolId",
    createHandleUpdateWikiIdol(resolveServices),
  );
  app.delete(
    "/api/admin/wiki/idols/:idolId",
    createHandleDeleteWikiIdol(resolveServices),
  );
  app.put(
    "/api/admin/wiki/agencies/:agencyId/icon",
    createHandleSaveWikiEntityImage(resolveServices, "agency", "agencyId"),
  );
  app.delete(
    "/api/admin/wiki/stories/:storyId",
    createHandleDeleteWikiStoryLink(resolveServices),
  );
  app.patch(
    "/api/admin/wiki/categories/:categoryId",
    createHandleUpdateWikiCategory(resolveServices),
  );
  app.post(
    "/api/admin/wiki/agencies/:agencyId/idols/:idolId/categories",
    createHandleCreateWikiCategory(resolveServices),
  );
  app.patch(
    "/api/admin/wiki/cards/:cardId",
    createHandleUpdateWikiStoryCard(resolveServices),
  );
  app.post(
    "/api/admin/wiki/cards/:cardId/sources",
    createHandleAddWikiStorySources(resolveServices),
  );
  app.put(
    "/api/admin/wiki/groups/:groupId/icon",
    createHandleSaveWikiEntityImage(resolveServices, "group", "groupId"),
  );
  app.put(
    "/api/admin/wiki/idols/:idolId/avatar",
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
    createHandleDeleteWikiAgencyIcon(resolveServices),
  );
  app.post(
    "/api/wiki/idol-media",
    createHandleUploadWikiIdolMedia(resolveServices),
  );
  app.delete(
    "/api/wiki/idol-media",
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
    createHandleParseBilibili(resolveServices),
  );
  app.put(
    "/api/admin/wiki/agencies/:agencyId/layout",
    createHandleSaveWikiLayout(resolveServices),
  );
  app.get(
    "/api/wiki/random_bg",
    createHandleRandomWikiBackground(resolveServices),
  );
}
