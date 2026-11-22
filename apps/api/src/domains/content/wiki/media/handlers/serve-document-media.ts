import type { Env } from 'hono';
import {
    wikiErrorBody,
    wikiJson,
    type WikiServicesResolver,
} from '@/domains/content/wiki/handler-support';
import { requireWikiServices } from '@/domains/content/wiki/service';
import { objectReadResponse } from '@/utils/http/object-read-response';
import type {
    WikiAssetParams,
    WikiValidatedInput,
} from '@/domains/content/wiki/request';
import type { WikiBinaryRouteHandler } from '@/domains/content/wiki/response';

/**
 * Public read route for document-uploaded images (`doc:<id>`).
 *
 * Serves object bytes (or redirects to a read URL) by database id so raw
 * storage object keys never reach public document payloads.
 */
export function createHandleServeWikiDocumentMedia<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiBinaryRouteHandler<E, WikiValidatedInput<'param', WikiAssetParams>> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story', 'storage']);
        const match = /^(\d+)\.webp$/.exec(context.req.valid('param').asset);
        const id = Number(match?.[1]);
        if (!Number.isSafeInteger(id) || id <= 0) {
            return wikiJson(wikiErrorBody('图片不存在'), 404);
        }
        const record = await services.story!.findWikiEntryDocumentMediaById(id);
        if (!record) return wikiJson(wikiErrorBody('图片不存在'), 404);
        try {
            const response = await objectReadResponse(
                context.req.raw,
                services.storage!,
                record.objectKey
            );
            return response ?? wikiJson(wikiErrorBody('图片不存在'), 404);
        } catch {
            return wikiJson(wikiErrorBody('图片不存在'), 404);
        }
    };
}
