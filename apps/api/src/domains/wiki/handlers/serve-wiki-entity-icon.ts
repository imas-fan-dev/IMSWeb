import type { Env } from 'hono';
import {
    wikiPlain,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { requireWikiServices } from '@/domains/wiki/service';
import { objectReadResponse } from '@/utils/http/object-read-response';
import type {
    WikiAssetParams,
    WikiValidatedInput
} from '@/domains/wiki/request';
import type { WikiBinaryRouteHandler } from '@/domains/wiki/response';

function entityId(value: string): number | null {
    const matched = /^(\d+)\.webp$/.exec(value);
    if (!matched) return null;
    const id = Number(matched[1]);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function createHandleServeWikiEntityIcon<E extends Env>(
    resolveServices: WikiServicesResolver<E>,
    entity: 'agency' | 'group'
): WikiBinaryRouteHandler<E, WikiValidatedInput<'param', WikiAssetParams>> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story', 'storage']);
        const id = entityId(context.req.valid('param').asset);
        if (!id) return wikiPlain('Not found', 404);
        const record = entity === 'agency'
            ? await services.story!.findAgencyById(id)
            : await services.story!.findWikiGroupById(id);
        if (!record?.icon_object_key) return wikiPlain('Not found', 404);
        try {
            return await objectReadResponse(
                context.req.raw,
                services.storage!,
                record.icon_object_key
            ) ?? wikiPlain('Not found', 404);
        } catch {
            return wikiPlain('Not found', 404);
        }
    };
}
