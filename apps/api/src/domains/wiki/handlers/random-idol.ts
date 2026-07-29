import type { Env, Handler } from "hono";
import {
  wikiJson,
  type WikiServicesResolver,
} from "@/domains/wiki/handler-support";
import { randomIdol, requireWikiServices } from "@/domains/wiki/service";

export function createHandleRandomWikiIdol<E extends Env>(
  resolveServices: WikiServicesResolver<E>,
): Handler<E> {
  return async (context) => {
    const services = await resolveServices(context);
    requireWikiServices(services, ["story", "storage"]);
    return wikiJson(await randomIdol(services.story!, services.storage!));
  };
}
