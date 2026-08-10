import type { Env } from 'hono';
import {
    authorizeWikiWrite,
    cleanupWikiObjects,
    cleanupWikiObjectPrefix,
    findWikiMutationTarget,
    wikiErrorBody,
    wikiJson,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { parseDeleteWikiCategoryRequest } from '@/domains/wiki/request';
import type { WikiRouteHandler } from '@/domains/wiki/response';
import {
    requireWikiServices,
    storyObjectKey
} from '@/domains/wiki/service';

export function createHandleDeleteWikiCategory<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage', 'uploads']);
        try {
            const { fields } = await parseDeleteWikiCategoryRequest(
                context.req.raw,
                services
            );
            const target = await findWikiMutationTarget(
                services,
                (fields.agency ?? '').trim(),
                (fields.idol ?? '').trim()
            );
            if ('error' in target) return target.error;
            const category = (fields.category_name ?? '').trim();
            const images = await services.story!.listCategoryImages(
                target.agency.code,
                target.idol.id,
                category
            );
            await services.story!.deleteCategory(
                target.agency.code,
                target.idol.id,
                category
            );
            const categoryRecord = await services.story!.deleteWikiCategoryAssociation(
                target.agency.id,
                target.idol.id,
                category
            );
            const keys = images.flatMap(({ image_file: imageFile }) => {
                if (!imageFile) return [];
                try {
                    return [storyObjectKey(
                        target.agency.code,
                        target.idol.folderName,
                        imageFile
                    )];
                } catch {
                    return [];
                }
            });
            if (categoryRecord) {
                const prefix = storyObjectKey(
                    target.agency.code,
                    target.idol.folderName,
                    `${categoryRecord.storage_slug}/placeholder`
                );
                await cleanupWikiObjectPrefix(
                    services,
                    prefix.slice(0, prefix.lastIndexOf('/')),
                    keys
                );
            } else {
                await cleanupWikiObjects(services, keys);
            }
            return wikiJson({ status: 'success' });
        } catch (error) {
            if (wikiStatusOf(error) === 413) {
                return wikiJson(wikiErrorBody('上传文件超过大小限制'), 413);
            }
            return wikiJson(wikiErrorBody('删除分类失败'), 500);
        }
    };
}
