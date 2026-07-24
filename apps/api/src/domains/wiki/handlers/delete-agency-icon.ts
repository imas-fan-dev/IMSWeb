import type { Env, Handler } from 'hono';
import {
    authorizeWikiWrite,
    findWikiAgencyTarget,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    agencyIconObjectKey,
    requireWikiServices
} from '@/domains/wiki/service';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

export function createHandleDeleteWikiAgencyIcon<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage']);
        try {
            const fields = await context.req.json<Record<string, unknown>>();
            const target = await findWikiAgencyTarget(
                services,
                typeof fields.agency === 'string' ? fields.agency.trim() : ''
            );
            if ('error' in target) return target.error;
            await deleteObjectWithCompensation(
                services,
                agencyIconObjectKey(target.agency.code)
            );
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
