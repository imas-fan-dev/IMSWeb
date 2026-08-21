import type { Env } from 'hono';
import {
    authorizeWikiWrite,
    findWikiAgencyTarget,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/content/wiki/handler-support';
import {
    requireWikiServices
} from '@/domains/content/wiki/service';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import type {
    DeleteWikiAgencyIconRequest,
    WikiValidatedInput
} from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';

export function createHandleDeleteWikiAgencyIcon<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E, WikiValidatedInput<'json', DeleteWikiAgencyIconRequest>> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage']);
        try {
            const fields = context.req.valid('json');
            const target = await findWikiAgencyTarget(services, fields.agency);
            if ('error' in target) return target.error;
            const record = await services.story!.findAgencyById(target.agency.id);
            const key = record?.icon_object_key ?? null;
            await services.story!.setAgencyIconObjectKey(target.agency.id, null);
            if (key?.startsWith(`wiki/agencies/${target.agency.code}/branding/`)) {
                await deleteObjectWithCompensation(services, key);
            }
            return wikiJson({ status: 'success' });
        } catch (error) {
            const status = wikiStatusOf(error, 400);
            return wikiJson(
                wikiErrorBody(wikiMessageOf(error, '删除系列图标失败')),
                status
            );
        }
    };
}
