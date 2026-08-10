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
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import { parseUploadWikiIdolMediaRequest } from '@/domains/wiki/request';
import type { WikiRouteHandler } from '@/domains/wiki/response';
import {
    idolMediaObjectKey,
    idolMediaUrl,
    requireWikiServices,
    validateAndConvertStoryImage
} from '@/domains/wiki/service';

export function createHandleUploadWikiIdolMedia<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage', 'images', 'uploads']);
        let createdKey: string | null = null;
        let cleanupCreated = false;
        try {
            const upload = await parseUploadWikiIdolMediaRequest(
                context.req.raw,
                services
            );
            const file = singleWikiFile(upload, 'image');
            if (!file?.filename) return wikiJson(wikiErrorBody('请选择角色图片'), 400);
            const target = await findWikiMutationTarget(
                services,
                (upload.fields.agency ?? '').trim(),
                (upload.fields.idol ?? '').trim()
            );
            if ('error' in target) return target.error;
            const converted = await validateAndConvertStoryImage(file, services.images!);
            createdKey = idolMediaObjectKey(target.agency.code, target.idol.folderName);
            cleanupCreated = !await services.storage!.exists(createdKey);
            const object = await services.storage!.put(createdKey, converted, {
                contentType: 'image/webp',
                metadata: { kind: 'idol-media', idol: target.idol.name }
            });
            await services.story!.setIdolAvatarObjectKey(target.idol.id, createdKey);
            return wikiJson({
                status: 'success',
                url: `${idolMediaUrl(target.agency.name, target.idol.name)}?v=${encodeURIComponent(object.etag)}`
            });
        } catch (error) {
            if (createdKey && cleanupCreated) await cleanupWikiObjects(services, [createdKey]);
            const status = wikiStatusOf(error);
            if (status === 413) return wikiJson(wikiErrorBody('上传文件超过大小限制'), 413);
            if (status === 400) {
                return wikiJson(wikiErrorBody(
                    wikiMessageOf(error, '图片内容损坏或无法解码')
                ), 400);
            }
            return wikiJson(wikiErrorBody('保存角色素材失败'), 500);
        }
    };
}
