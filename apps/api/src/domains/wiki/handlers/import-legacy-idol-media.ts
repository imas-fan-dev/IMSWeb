import type { Env, Handler } from 'hono';
import {
    authorizeWikiWrite,
    wikiErrorBody,
    wikiJson,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { importLegacyIdolMedia, requireWikiServices } from '@/domains/wiki/service';

export function createHandleImportLegacyWikiIdolMedia<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage', 'staticAssets', 'images']);
        try {
            const result = await importLegacyIdolMedia(
                services.story!,
                services.storage!,
                services.staticAssets!,
                services.images!,
                context.req.url
            );
            return wikiJson({ status: 'success', ...result });
        } catch {
            return wikiJson(wikiErrorBody('导入 Legacy 角色素材失败'), 500);
        }
    };
}
