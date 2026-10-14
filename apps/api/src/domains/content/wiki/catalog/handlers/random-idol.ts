import type { Env } from "hono";
import {
  wikiJson,
  type WikiServicesResolver,
} from "@/domains/content/wiki/handler-support";
import { randomIdol, requireWikiServices } from "@/domains/content/wiki/service";
import type { WikiRouteHandler } from "@/domains/content/wiki/response";

export function createHandleRandomWikiIdol<E extends Env>(
  resolveServices: WikiServicesResolver<E>,
): WikiRouteHandler<E> {
  return async (context) => {
    const services = await resolveServices(context);
    requireWikiServices(services, ["story", "storage"]);
    return wikiJson(await randomIdol(services.story!, services.storage!));
  };
}
