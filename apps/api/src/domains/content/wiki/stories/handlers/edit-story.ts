import type { Env } from 'hono';
import {
    authorizeWikiWrite,
    cleanupWikiObjects,
    findWikiMutationTarget,
    optionalWikiCatalogId,
    singleWikiFile,
    splitStoryUrl,
    resolveWikiStorySources,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    writeWikiAudit,
    type WikiServicesResolver
} from '@/domains/content/wiki/handler-support';
import { parseEditWikiStoryRequest } from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';
import {
    parseWikiImageTransform,
    parseWikiMediaRevision
} from '@/domains/content/wiki/image-transform';
import {
    categoryStorageSlug,
    newStoryImageLocation,
    requireWikiServices,
    storyImageTransform,
    storyObjectKey,
    validateAndConvertStoryImage
} from '@/domains/content/wiki/service';

export function createHandleEditWikiStory<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage', 'images', 'uploads']);
        let createdKey: string | null = null;
        let oldKey: string | null = null;
        try {
            const upload = await parseEditWikiStoryRequest(context.req.raw, services);
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
            const categoryRecord = await services.story!.ensureWikiCategory(
                target.agency.id,
                target.idol.id,
                category,
                categoryStorageSlug(category)
            );
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
            const imageTransform = parseWikiImageTransform(
                fields,
                storyImageTransform(record)
            );
            const expectedMediaRevision = parseWikiMediaRevision(
                fields,
                record.image_media_revision
            );
            const oldCardName = storyIdField ? record.card_name : requestedOldCardName;
            const oldCategory = storyIdField ? record.category : requestedOldCategory;
            let imageFile = record.image_file;
            if (file?.filename && converted) {
                const location = newStoryImageLocation(
                    target.agency.code,
                    target.idol.folderName,
                    categoryRecord.storage_slug
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
                    categoryRecord.storage_slug,
                    extension
                );
                const sourceKey = storyObjectKey(
                    target.agency.code, target.idol.folderName, record.image_file
                );
                if (await services.storage!.exists(sourceKey)) {
                    createdKey = location.key;
                    await services.storage!.copy(sourceKey, location.key);
                    oldKey = sourceKey;
                    imageFile = location.imageFile;
                }
            }
            const parsedUrl = splitStoryUrl((fields.url ?? '').trim());
            const [resolvedSource] = await resolveWikiStorySources(services.story!, [{
                upName: (fields.up_name ?? '').trim(),
                videoTitle: (fields.video_title ?? '').trim(),
                url: parsedUrl.url,
                contentTypeId: optionalWikiCatalogId(
                    fields.content_type_id,
                    '内容类型'
                ) ?? record.content_type_id,
                sourcePlatformId: optionalWikiCatalogId(
                    fields.source_platform_id,
                    '来源平台'
                ) ?? record.source_platform_id
            }]);
            const story = {
                id: record.id,
                agencyCode: target.agency.code,
                idolId: target.idol.id,
                category,
                cardName,
                upName: resolvedSource!.upName,
                videoTitle: resolvedSource!.videoTitle,
                url: parsedUrl.url,
                contentTypeId: resolvedSource!.contentTypeId,
                sourcePlatformId: resolvedSource!.sourcePlatformId,
                subtitle: parsedUrl.subtitle,
                imageFile,
                coverAssetId: file?.filename ? null : record.cover_asset_id,
                imageTransform,
                expectedMediaRevision
            };
            await services.story!.updateStoryAndRenameGroup({
                story,
                rename: oldCardName !== cardName || oldCategory !== category
                    ? { oldCategory, oldCardName, category, cardName, subtitle: parsedUrl.subtitle }
                    : undefined
            });
            if (oldKey) await cleanupWikiObjects(services, [oldKey]);
            await writeWikiAudit(
                context,
                services,
                '更新 Wiki 剧情来源',
                `agency=${target.agency.code};idol_id=${target.idol.id};story_id=${record.id};revision=${expectedMediaRevision}`
            );
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
            if (status >= 400 && status < 500) {
                return wikiJson(
                    wikiErrorBody(wikiMessageOf(error, '剧情卡片状态冲突')),
                    status
                );
            }
            return wikiJson(wikiErrorBody('修改剧情失败'), 500);
        }
    };
}
