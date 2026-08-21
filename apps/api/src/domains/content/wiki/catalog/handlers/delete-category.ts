import type { Env } from 'hono';
import {
    authorizeWikiWrite,
    cleanupWikiObjects,
    cleanupWikiObjectPrefix,
    findWikiMutationTarget,
    wikiErrorBody,
    wikiJson,
    wikiStatusOf,
    writeWikiAudit,
    type WikiServicesResolver
} from '@/domains/content/wiki/handler-support';
import { parseDeleteWikiCategoryRequest } from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';
import {
    requireWikiServices,
    storyObjectKey
} from '@/domains/content/wiki/service';

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
            if (fields.expected_revision === undefined || fields.expected_revision === '') {
                return wikiJson(wikiErrorBody('缺少分类版本'), 428);
            }
            const expectedRevision = Number(fields.expected_revision);
            if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
                return wikiJson(wikiErrorBody('分类版本无效'), 400);
            }
            const images = await services.story!.listCategoryImages(
                target.agency.code,
                target.idol.id,
                category
            );
            const deleted = await services.story!.deleteCategory({
                agencyCode: target.agency.code,
                agencyId: target.agency.id,
                idolId: target.idol.id,
                category,
                expectedRevision
            });
            if (deleted.status === 'not-found') {
                return wikiJson(wikiErrorBody('分类不存在'), 404);
            }
            if (deleted.status === 'conflict') {
                return wikiJson({
                    ...wikiErrorBody('分类已被其他编辑更新，请刷新后重试'),
                    revision: deleted.revision
                }, 409);
            }
            const categoryRecord = deleted.category;
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
            await writeWikiAudit(
                context,
                services,
                '删除 Wiki 分类',
                `agency=${target.agency.code};idol_id=${target.idol.id};category_id=${categoryRecord.id};revision=${expectedRevision}`
            );
            return wikiJson({ status: 'success' });
        } catch (error) {
            if (wikiStatusOf(error) === 413) {
                return wikiJson(wikiErrorBody('上传文件超过大小限制'), 413);
            }
            return wikiJson(wikiErrorBody('删除分类失败'), 500);
        }
    };
}
