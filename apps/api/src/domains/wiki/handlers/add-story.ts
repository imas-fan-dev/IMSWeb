import type { Env, Handler } from 'hono';
import {
    authorizeWikiWrite,
    cleanupWikiObjects,
    findWikiMutationTarget,
    parseWikiUpload,
    singleWikiFile,
    splitStoryUrl,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    categoryStorageSlug,
    newStoryImageLocation,
    requireWikiServices,
    validateAndConvertStoryImage
} from '@/domains/wiki/service';

export function createHandleAddWikiStory<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage', 'images', 'uploads']);
        let createdKey: string | null = null;
        try {
            const upload = await parseWikiUpload(context.req.raw, services);
            const fields = upload.fields;
            const file = singleWikiFile(upload, 'image');
            const converted = file?.filename
                ? await validateAndConvertStoryImage(file, services.images!)
                : null;
            const target = await findWikiMutationTarget(
                services,
                (fields.agency ?? '').trim(),
                (fields.idol ?? '').trim()
            );
            if ('error' in target) return target.error;
            const category = (fields.category_name ?? '未分类剧情').trim();
            const categoryRecord = await services.story!.ensureWikiCategory(
                target.agency.id,
                target.idol.id,
                category,
                categoryStorageSlug(category)
            );
            const cardName = (fields.card_name ?? '').trim();
            const upName = (fields.up_name ?? '默认UP').trim();
            const videoTitle = (fields.video_title ?? '').trim();
            const parsedUrl = splitStoryUrl((fields.url ?? '#').trim());
            let imageFile: string | null = '';
            if (file?.filename && converted) {
                const location = newStoryImageLocation(
                    target.agency.code,
                    target.idol.folderName,
                    categoryRecord.storage_slug
                );
                createdKey = location.key;
                imageFile = location.imageFile;
                await services.storage!.put(createdKey, converted, { contentType: 'image/webp' });
            }
            await services.story!.insertStoryReturningId({
                agencyCode: target.agency.code,
                idolId: target.idol.id,
                category,
                cardName,
                upName,
                videoTitle,
                url: parsedUrl.url,
                subtitle: parsedUrl.subtitle,
                imageFile
            });
            return wikiJson({ status: 'success' });
        } catch (error) {
            if (createdKey) await cleanupWikiObjects(services, [createdKey]);
            const status = wikiStatusOf(error);
            if (status === 413) return wikiJson(wikiErrorBody('上传文件超过大小限制'), 413);
            if (status === 400) {
                return wikiJson(wikiErrorBody(
                    wikiMessageOf(error, '图片内容损坏或无法解码')
                ), 400);
            }
            return wikiJson(wikiErrorBody('保存剧情失败'), 500);
        }
    };
}
