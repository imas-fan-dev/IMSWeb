import type { Env } from 'hono';
import {
    authorizeWikiWrite,
    cleanupWikiObjects,
    findWikiAgencyTarget,
    singleWikiFile,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    type WikiServicesResolver
} from '@/domains/content/wiki/handler-support';
import { parseUploadWikiAgencyIconRequest } from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';
import {
    agencyIconObjectKey,
    agencyIconUrl,
    requireWikiServices,
    validateAndConvertStoryImage
} from '@/domains/content/wiki/service';

export function createHandleUploadWikiAgencyIcon<E extends Env>(
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
            const upload = await parseUploadWikiAgencyIconRequest(
                context.req.raw,
                services
            );
            const file = singleWikiFile(upload, 'image');
            if (!file?.filename) {
                return wikiJson(wikiErrorBody('请选择系列图标'), 400);
            }
            const target = await findWikiAgencyTarget(
                services,
                (upload.fields.agency ?? '').trim()
            );
            if ('error' in target) return target.error;
            const converted = await validateAndConvertStoryImage(
                file,
                services.images!
            );
            createdKey = agencyIconObjectKey(target.agency.code);
            cleanupCreated = !await services.storage!.exists(createdKey);
            await services.storage!.put(
                createdKey,
                converted,
                {
                    contentType: 'image/webp',
                    metadata: {
                        kind: 'agency-icon',
                        agency: target.agency.name
                    }
                }
            );
            await services.story!.setAgencyIconObjectKey(target.agency.id, createdKey);
            return wikiJson({
                status: 'success',
                url: agencyIconUrl(target.agency.id)
            });
        } catch (error) {
            if (createdKey && cleanupCreated) await cleanupWikiObjects(services, [createdKey]);
            const status = wikiStatusOf(error);
            if (status === 413) {
                return wikiJson(wikiErrorBody('上传文件超过大小限制'), 413);
            }
            if (status === 400) {
                return wikiJson(
                    wikiErrorBody(
                        wikiMessageOf(error, '图片内容损坏或无法解码')
                    ),
                    400
                );
            }
            return wikiJson(wikiErrorBody('保存系列图标失败'), 500);
        }
    };
}
