import { adminWikiPath } from '@imsweb/contracts/paths';
import type { Env, Hono } from "hono";
import { registerWikiCatalogRoutes } from "@/domains/content/wiki/catalog/routes";
import {
  createWikiAdminAuthorization,
  type WikiServicesResolver,
} from "@/domains/content/wiki/handler-support";
import { registerWikiMediaRoutes } from "@/domains/content/wiki/media/routes";
import { registerWikiStoryRoutes } from "@/domains/content/wiki/stories/routes";

export type { WikiServicesResolver } from "@/domains/content/wiki/handler-support";

export function registerWikiRoutes<E extends Env>(
  app: Hono<E>,
  resolveServices: WikiServicesResolver<E>,
): void {
  app.use(adminWikiPath('/*'), createWikiAdminAuthorization(resolveServices));

  registerWikiMediaRoutes(app, resolveServices);
  registerWikiCatalogRoutes(app, resolveServices);
  registerWikiStoryRoutes(app, resolveServices);
}
