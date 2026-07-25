import type { Env, Handler } from 'hono';
import {
    authorizeWikiWrite,
    cleanupWikiObjects,
    findWikiMutationTarget,
    parseWikiUpload,
    wikiErrorBody,
    wikiJson,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    requireWikiServices,
    storyObjectKey
} from '@/domains/wiki/service';

export function createHandleDeleteWikiStory<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage', 'uploads']);
        try {
            const { fields } = await parseWikiUpload(context.req.raw, services);
            const target = await findWikiMutationTarget(
                services,
                (fields.agency ?? '').trim(),
                (fields.idol ?? '').trim()
            );
            if ('error' in target) return target.error;
            const category = (fields.category_name ?? '').trim();
            const cardName = (fields.card_name ?? '').trim();
            const rows = await services.story!.listStoryGroupForDelete(
                target.agency.code,
                target.idol.id,
                category,
                cardName
            );
            await services.story!.deleteStoryGroup(
                target.agency.code,
                target.idol.id,
                category,
                cardName
            );
            await cleanupWikiObjects(services, rows.flatMap((row) => {
                if (!row.image_file) return [];
                try {
                    return [storyObjectKey(
                        target.agency.code,
                        target.idol.folderName,
                        row.image_file
                    )];
                } catch {
                    return [];
                }
            }));
            return wikiJson({ status: 'success' });
        } catch (error) {
            if (wikiStatusOf(error) === 413) {
                return wikiJson(wikiErrorBody('上传文件超过大小限制'), 413);
            }
            return wikiJson(wikiErrorBody('删除剧情失败'), 500);
        }
    };
}
