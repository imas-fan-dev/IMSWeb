import type { Env } from 'hono';
import { wikiPlain, type WikiServicesResolver } from '@/domains/wiki/handler-support';
import { requireWikiServices } from '@/domains/wiki/service';
import { objectReadResponse } from '@/utils/http/object-read-response';
import type {
    WikiAssetParams,
    WikiValidatedInput
} from '@/domains/wiki/request';
import type { WikiBinaryRouteHandler } from '@/domains/wiki/response';

export function createHandleServeWikiStoryCoverAsset<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiBinaryRouteHandler<E, WikiValidatedInput<'param', WikiAssetParams>> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story', 'storage']);
        const match = /^(\d+)\.webp$/.exec(context.req.valid('param').asset);
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
