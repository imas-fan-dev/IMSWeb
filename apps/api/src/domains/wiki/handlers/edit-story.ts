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
    newStoryImageLocation,
    requireWikiServices,
    storyObjectKey,
    validateAndConvertStoryImage
} from '@/domains/wiki/service';

export function createHandleEditWikiStory<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage', 'images', 'uploads']);
        let createdKey: string | null = null;
        let oldKey: string | null = null;
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
            const requestedOldCardName = (fields.old_card_name ?? '').trim();
            const requestedOldCategory = (fields.old_category_name ?? '').trim();
            const category = (fields.category_name ?? '').trim();
            const cardName = (fields.card_name ?? '').trim();
            const storyIdField = (fields.story_id ?? '').trim();
            const storyId = Number(storyIdField);
            if (storyIdField && (!Number.isSafeInteger(storyId) || storyId <= 0)) {
                return wikiJson(wikiErrorBody('剧情 ID 无效'), 400);
            }
            const record = storyIdField
                ? await services.story!.findStoryById(
                    target.agency.code,
                    target.idol.id,
                    storyId
                )
                : await services.story!.findFirstStoryByCard(
                    target.agency.code,
                    target.idol.id,
                    requestedOldCategory,
                    requestedOldCardName
                );
            if (!record) return wikiJson(wikiErrorBody('找不到要修改的记录'));
            const oldCardName = storyIdField ? record.card_name : requestedOldCardName;
            const oldCategory = storyIdField ? record.category : requestedOldCategory;
            let imageFile = record.image_file;
            if (file?.filename && converted) {
                const location = newStoryImageLocation(
                    target.agency.code,
                    target.idol.folderName,
                    category
                );
                createdKey = location.key;
                imageFile = location.imageFile;
                await services.storage!.put(createdKey, converted, { contentType: 'image/webp' });
                if (record.image_file) {
                    oldKey = storyObjectKey(
                        target.agency.code,
                        target.idol.folderName,
                        record.image_file
                    );
                }
            } else if (record.image_file && oldCategory !== category) {
                const extension = /(?:\.[^./]+)$/.exec(record.image_file)?.[0] ?? '.webp';
                const location = newStoryImageLocation(
                    target.agency.code,
                    target.idol.folderName,
                    category,
                    extension
                );
                const sourceKey = storyObjectKey(
                    target.agency.code,
                    target.idol.folderName,
                    record.image_file
                );
                if (await services.storage!.exists(sourceKey)) {
                    createdKey = location.key;
                    await services.storage!.copy(sourceKey, location.key);
                    oldKey = sourceKey;
                    imageFile = location.imageFile;
                }
            }
            const parsedUrl = splitStoryUrl((fields.url ?? '').trim());
            const story = {
                id: record.id,
                agencyCode: target.agency.code,
                idolId: target.idol.id,
                category,
                cardName,
                upName: (fields.up_name ?? '').trim(),
                videoTitle: (fields.video_title ?? '').trim(),
                url: parsedUrl.url,
                subtitle: parsedUrl.subtitle,
                imageFile
            };
            await services.story!.updateStoryAndRenameGroup({
                story,
                rename: oldCardName !== cardName || oldCategory !== category
                    ? { oldCategory, oldCardName, category, cardName, subtitle: parsedUrl.subtitle }
                    : undefined
            });
            if (oldKey) await cleanupWikiObjects(services, [oldKey]);
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
            return wikiJson(wikiErrorBody('修改剧情失败'), 500);
        }
    };
}
