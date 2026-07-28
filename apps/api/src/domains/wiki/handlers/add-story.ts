import type { Env, Handler } from 'hono';
import {
    authorizeWikiWrite,
    cleanupWikiObjects,
    findWikiMutationTarget,
    optionalWikiCatalogId,
    parseWikiUpload,
    singleWikiFile,
    splitStoryUrl,
    resolveWikiStorySources,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { parseWikiImageTransform } from '@/domains/wiki/image-transform';
import {
    categoryStorageSlug,
    newStoryImageLocation,
    requireWikiServices,
    validateAndConvertStoryImage
} from '@/domains/wiki/service';

interface StorySourceInput {
    upName: string;
    videoTitle: string;
    url: string;
    contentTypeId?: number;
    sourcePlatformId?: number;
}

function requiredSourceText(
    value: unknown,
    label: string,
    maximumLength: number
): string {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > maximumLength) {
        throw Object.assign(new Error(`${label}无效`), { status: 400 });
    }
    return value.trim();
}

function storySources(fields: Record<string, string>): {
    sources: StorySourceInput[];
    subtitle: string;
} {
    if (!fields.sources_json) {
        const parsedUrl = splitStoryUrl((fields.url ?? '#').trim());
        return {
            sources: [{
                upName: (fields.up_name ?? '默认UP').trim(),
                videoTitle: (fields.video_title ?? '').trim(),
                url: parsedUrl.url,
                contentTypeId: optionalWikiCatalogId(
                    fields.content_type_id,
                    '内容类型'
                ),
                sourcePlatformId: optionalWikiCatalogId(
                    fields.source_platform_id,
                    '来源平台'
                )
            }],
            subtitle: parsedUrl.subtitle
        };
    }
    let value: unknown;
    try {
        value = JSON.parse(fields.sources_json);
    } catch {
        throw Object.assign(new Error('剧情来源列表不是有效 JSON'), { status: 400 });
    }
    if (!Array.isArray(value) || value.length > 20) {
        throw Object.assign(new Error('剧情卡片允许 0 至 20 个来源'), { status: 400 });
    }
    const sources = value.map((source, index) => {
        if (!source || typeof source !== 'object' || Array.isArray(source)) {
            throw Object.assign(new Error(`第 ${index + 1} 个来源无效`), { status: 400 });
        }
        const record = source as Record<string, unknown>;
        return {
            upName: requiredSourceText(record.upName, `第 ${index + 1} 个来源投稿者`, 100),
            videoTitle: requiredSourceText(
                record.videoTitle,
                `第 ${index + 1} 个来源标题`,
                500
            ),
            url: requiredSourceText(record.url, `第 ${index + 1} 个来源链接`, 2048),
            contentTypeId: optionalWikiCatalogId(
                record.contentTypeId,
                `第 ${index + 1} 个来源内容类型`
            ),
            sourcePlatformId: optionalWikiCatalogId(
                record.sourcePlatformId,
                `第 ${index + 1} 个来源平台`
            )
        };
    });
    const subtitle = (fields.subtitle ?? '').trim();
    if (subtitle.length > 500) {
        throw Object.assign(new Error('剧情备注不能超过 500 个字符'), { status: 400 });
    }
    return { sources, subtitle };
}

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
            const imageTransform = parseWikiImageTransform(fields, {
                fit: 'cover',
                focalX: 0.5,
                focalY: 0.5,
                zoom: 1,
                rotation: 0
            });
            const file = singleWikiFile(upload, 'image');
            const coverAssetId = optionalWikiCatalogId(
                fields.cover_asset_id,
                '共享封面素材'
            ) ?? null;
            if (file?.filename && coverAssetId !== null) {
                throw Object.assign(new Error('不能同时上传独立图片并选择共享素材'), {
                    status: 400
                });
            }
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
            const cardName = (fields.card_name ?? '').trim();
            if (!cardName) {
                throw Object.assign(new Error('卡片名称不能为空'), { status: 400 });
            }
            const { sources, subtitle } = storySources(fields);
            const resolvedSources = await resolveWikiStorySources(services.story!, sources);
            const categoryRecord = await services.story!.ensureWikiCategory(
                target.agency.id,
                target.idol.id,
                category,
                categoryStorageSlug(category)
            );
            let imageFile: string | null = null;
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
            await services.story!.insertStoryBatchReturningIds({
                agencyCode: target.agency.code,
                idolId: target.idol.id,
                category,
                cardName,
                subtitle,
                imageFile,
                coverAssetId,
                imageTransform,
                links: resolvedSources
            });
            return wikiJson({ status: 'success', sourceCount: resolvedSources.length });
        } catch (error) {
            if (createdKey) await cleanupWikiObjects(services, [createdKey]);
            const status = wikiStatusOf(error);
            if (status === 413) return wikiJson(wikiErrorBody('上传文件超过大小限制'), 413);
            if (status === 409) {
                return wikiJson(wikiErrorBody(
                    wikiMessageOf(error, '该卡片已经存在且媒体信息不一致')
                ), 409);
            }
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
            return wikiJson(wikiErrorBody('保存剧情失败'), 500);
        }
    };
}
