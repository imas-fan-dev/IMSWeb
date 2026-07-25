import type { Env, Handler } from 'hono';
import {
    authorizeWikiWrite,
    findWikiMutationTarget,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    requireWikiServices
} from '@/domains/wiki/service';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

export function createHandleDeleteWikiIdolMedia<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage']);
        try {
            const fields = await context.req.json<Record<string, unknown>>();
            const target = await findWikiMutationTarget(
                services,
                typeof fields.agency === 'string' ? fields.agency.trim() : '',
                typeof fields.idol === 'string' ? fields.idol.trim() : ''
            );
            if ('error' in target) return target.error;
            const record = await services.story!.findIdolById(target.idol.id);
            const key = record?.avatar_object_key ?? null;
            await services.story!.setIdolAvatarObjectKey(target.idol.id, null);
            const prefix = `wiki/agencies/${target.agency.code}/idols/` +
                `${target.idol.folderName}/`;
            if (key?.startsWith(prefix)) {
                await deleteObjectWithCompensation(services, key);
            }
            return wikiJson({ status: 'success' });
        } catch (error) {
            const status = wikiStatusOf(error, 400);
            return wikiJson(
                wikiErrorBody(wikiMessageOf(error, '删除角色素材失败')),
                status
            );
        }
    };
}
