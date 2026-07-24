import type { Env, Handler } from 'hono';
import {
    authorizeWikiWrite,
    findWikiMutationTarget,
    parseWikiUpload,
    singleWikiFile,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/wiki/handler-support';
import {
    idolMediaObjectKey,
    idolMediaUrl,
    requireWikiServices,
    validateAndConvertStoryImage
} from '@/domains/wiki/service';

export function createHandleUploadWikiIdolMedia<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        const unauthorized = await authorizeWikiWrite(context, services);
        if (unauthorized) return unauthorized;
        requireWikiServices(services, ['story', 'storage', 'images', 'uploads']);
        try {
            const upload = await parseWikiUpload(context.req.raw, services);
            const file = singleWikiFile(upload, 'image');
            if (!file?.filename) return wikiJson(wikiErrorBody('请选择角色图片'), 400);
            const target = await findWikiMutationTarget(
                services,
                (upload.fields.agency ?? '').trim(),
                (upload.fields.idol ?? '').trim()
            );
            if ('error' in target) return target.error;
            const converted = await validateAndConvertStoryImage(file, services.images!);
            const key = idolMediaObjectKey(target.agency.code, target.idol.folderName);
            const object = await services.storage!.put(key, converted, {
                contentType: 'image/webp',
                metadata: { kind: 'idol-media', idol: target.idol.name }
            });
            return wikiJson({
                status: 'success',
                url: `${idolMediaUrl(target.agency.name, target.idol.name)}?v=${encodeURIComponent(object.etag)}`
            });
        } catch (error) {
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
