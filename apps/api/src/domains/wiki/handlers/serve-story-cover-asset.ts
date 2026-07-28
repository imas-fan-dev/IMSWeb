import type { Env, Handler } from 'hono';
import { wikiPlain, type WikiServicesResolver } from '@/domains/wiki/handler-support';
import { requireWikiServices } from '@/domains/wiki/service';
import { objectReadResponse } from '@/utils/http/object-read-response';

export function createHandleServeWikiStoryCoverAsset<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story', 'storage']);
        const match = /^(\d+)\.webp$/.exec(context.req.param('asset') ?? '');
        const id = Number(match?.[1]);
        if (!Number.isSafeInteger(id) || id <= 0) return wikiPlain('Not found', 404);
        const asset = await services.story!.findStoryCoverAssetById(id);
        if (!asset) return wikiPlain('Not found', 404);
        try {
            return await objectReadResponse(
                context.req.raw,
                services.storage!,
                asset.object_key
            ) ?? wikiPlain('Not found', 404);
        } catch {
            return wikiPlain('Not found', 404);
        }
    };
}
