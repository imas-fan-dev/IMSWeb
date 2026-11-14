import type { Env } from 'hono';
import {
    authorizeWikiWrite,
    cleanupWikiObjects,
    findWikiMutationTarget,
    singleWikiFile,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    writeWikiAudit,
    type WikiServicesResolver
} from '@/domains/content/wiki/handler-support';
import {
    parseUpdateWikiStoryCardRequest,
    type WikiIdParams,
    type WikiValidatedInput
} from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';
import {
    parseWikiImageTransform,
    parseWikiMediaRevision
} from '@/domains/content/wiki/image-transform';
import {
    newStoryImageLocation,
    requireWikiServices,
    storyImageTransform,
    storyObjectKey,
    validateAndConvertStoryImage
} from '@/domains/content/wiki/service';

function positiveId(value: string | undefined, label: string): number {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw Object.assign(new Error(`${label} ID 无效`), { status: 400 });
    }
    return id;
}

function cardNameValue(value: string | undefined, fallback: string): string {
    const name = value === undefined ? fallback : value.trim();
    if (!name || name.length > 200) {
        throw Object.assign(new Error('卡片名称无效'), { status: 400 });
    }
    return name;
}

function subtitleValue(value: string | undefined, fallback: string): string {
    const subtitle = value === undefined ? fallback : value.trim();
    if (subtitle.length > 500) {
        throw Object.assign(new Error('卡片副标题过长'), { status: 400 });
    }
    return subtitle;
}

function removeImageValue(value: string | undefined): boolean {
    if (value === undefined || value === '' || value === 'false') return false;
    if (value === 'true') return true;
    throw Object.assign(new Error('移除图片参数无效'), { status: 400 });
}

export function createHandleUpdateWikiStoryCard<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E, WikiValidatedInput<'param', WikiIdParams>> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage', 'images', 'uploads']);
        let createdKey: string | null = null;
        let oldKey: string | null = null;
        try {
            const cardId = context.req.valid('param').id;
            const upload = await parseUpdateWikiStoryCardRequest(context.req.raw, services);
            const fields = upload.fields;
            const target = await findWikiMutationTarget(
                services,
                (fields.agency ?? '').trim(),
                (fields.idol ?? '').trim(),
                404
            );
            if ('error' in target) return target.error;
            const record = await services.story!.findStoryCardById(
                target.agency.code,
                target.idol.id,
                cardId
            );
            if (!record) return wikiJson(wikiErrorBody('剧情卡片不存在'), 404);
            if (fields.expected_revision === undefined || fields.expected_revision === '') {
                return wikiJson(wikiErrorBody('缺少卡片版本'), 400);
            }
            const expectedRevision = parseWikiMediaRevision(
                fields,
                record.image_media_revision
            );
            const categories = await services.story!.listWikiCategories(
                target.agency.id,
                target.idol.id
            );
            const currentCategory = categories.find((category) =>
                category.name === record.category
            );
            const categoryId = fields.category_id === undefined || fields.category_id === ''
                ? currentCategory?.id
                : positiveId(fields.category_id, '分类');
            const category = categories.find((candidate) => candidate.id === categoryId);
            if (!category) {
                return wikiJson(wikiErrorBody('分类不属于所选内容页'), 400);
            }
            const file = singleWikiFile(upload, 'image');
            const removeImage = removeImageValue(fields.remove_image);
            const coverAssetId = fields.cover_asset_id === undefined
                ? record.cover_asset_id
                : fields.cover_asset_id === ''
                    ? null
                    : positiveId(fields.cover_asset_id, '共享封面素材');
            if (file?.filename && (removeImage || coverAssetId !== null)) {
                return wikiJson(
                    wikiErrorBody('不能同时上传独立图片并选择或移除共享素材'),
                    400
                );
            }
            const imageTransform = parseWikiImageTransform(
                fields,
                storyImageTransform(record)
            );
            let imageFile = record.image_file;
            let selectedCoverAssetId = coverAssetId;
            if (file?.filename) {
                const converted = await validateAndConvertStoryImage(file, services.images!);
                const location = newStoryImageLocation(
                    target.agency.code,
                    target.idol.folderName,
                    category.storage_slug
                );
                createdKey = location.key;
                imageFile = location.imageFile;
                selectedCoverAssetId = null;
                await services.storage!.put(createdKey, converted, { contentType: 'image/webp' });
                if (record.image_file) {
                    oldKey = storyObjectKey(
                        target.agency.code,
                        target.idol.folderName,
                        record.image_file
                    );
                }
            } else if (removeImage) {
                imageFile = null;
                selectedCoverAssetId = null;
                if (record.image_file) {
                    oldKey = storyObjectKey(
                        target.agency.code,
                        target.idol.folderName,
                        record.image_file
                    );
                }
            } else if (selectedCoverAssetId !== null) {
                imageFile = null;
                if (record.image_file) {
                    oldKey = storyObjectKey(
                        target.agency.code,
                        target.idol.folderName,
                        record.image_file
                    );
                }
            } else if (record.image_file && category.name !== record.category) {
                const extension = /(?:\.[^./]+)$/.exec(record.image_file)?.[0] ?? '.webp';
                const location = newStoryImageLocation(
                    target.agency.code,
                    target.idol.folderName,
                    category.storage_slug,
                    extension
                );
                const sourceKey = storyObjectKey(
                    target.agency.code,
                    target.idol.folderName,
                    record.image_file
                );
                if (!await services.storage!.exists(sourceKey)) {
                    throw Object.assign(new Error('卡片原图不存在，无法移动分类'), {
                        status: 409
                    });
                }
                createdKey = location.key;
                imageFile = location.imageFile;
                await services.storage!.copy(sourceKey, createdKey);
                oldKey = sourceKey;
            }
            const result = await services.story!.updateStoryCard({
                agencyCode: target.agency.code,
                idolId: target.idol.id,
                id: cardId,
                categoryId: category.id,
                cardName: cardNameValue(fields.card_name, record.card_name),
                subtitle: subtitleValue(fields.subtitle, record.subtitle ?? ''),
                imageFile,
                coverAssetId: selectedCoverAssetId,
                imageTransform,
                expectedRevision
            });
            if (result.status === 'conflict') {
                if (createdKey) await cleanupWikiObjects(services, [createdKey]);
                createdKey = null;
                return wikiJson({
                    status: 'error',
                    msg: '卡片已被其他编辑更新，请刷新后重试',
                    mediaRevision: result.revision
                }, 409);
            }
            if (oldKey) await cleanupWikiObjects(services, [oldKey]);
            await writeWikiAudit(
                context,
                services,
                '更新 Wiki 剧情卡片',
                `agency=${target.agency.code};idol_id=${target.idol.id};card_id=${cardId};revision=${result.revision}`
            );
            return wikiJson({
                status: 'success',
                mediaRevision: result.revision,
                revision: result.revision,
                imageFile,
                coverAssetId: selectedCoverAssetId,
                imageTransform
            });
        } catch (error) {
            if (createdKey) await cleanupWikiObjects(services, [createdKey]);
            const status = wikiStatusOf(error);
            const duplicate = error instanceof Error && /unique|duplicate/i.test(error.message);
            if (status === 413) {
                return wikiJson(wikiErrorBody('上传文件超过大小限制'), 413);
            }
            return wikiJson(
                wikiErrorBody(duplicate
                    ? '同一分类下已存在同名卡片'
                    : wikiMessageOf(error, '编辑剧情卡片失败')),
                duplicate ? 409 : status
            );
        }
    };
}
