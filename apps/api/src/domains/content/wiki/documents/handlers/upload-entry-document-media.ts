import type { Env } from 'hono';
import {
    cleanupWikiObjects,
    singleWikiFile,
    wikiErrorBody,
    wikiJson,
    wikiMessageOf,
    wikiStatusOf,
    writeWikiAudit,
    type WikiServicesResolver,
} from '@/domains/content/wiki/handler-support';
import {
    requireWikiServices,
    validateAndConvertStoryImage,
} from '@/domains/content/wiki/service';
import { documentImageUrl } from '@/domains/content/wiki/documents/document-assets';
import type { WikiEntryDocumentParams } from '@/domains/content/wiki/documents/document-request';
import {
    parseUploadWikiEntryDocumentMediaRequest,
    type WikiValidatedInput,
} from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';

/** Uploaded document images live under the entry, never under a shared prefix. */
function documentMediaObjectKey(
    projectCode: string,
    entryId: number,
    version: string
): string {
    return `wiki/projects/${projectCode}/entries/${entryId}/document/${version}.webp`;
}

function documentMediaAltText(
    upload: Record<string, string>,
    filename: string
): string {
    const requested = (upload.alt_text ?? upload.alt ?? '').trim();
    return (requested || filename).slice(0, 300);
}

/**
 * `POST /api/admin/wiki/entries/:entryId/document/media`.
 *
 * Accepts one multipart image, converts it to WebP through the shared media
 * port, stores it in object storage, and answers with the public read URL of
 * the new `doc:<id>` reference. The raw object key never leaves the API.
 */
export function createHandleUploadWikiEntryDocumentMedia<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<E, WikiValidatedInput<'param', WikiEntryDocumentParams>> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story', 'storage', 'images', 'uploads']);
        const { entryId } = context.req.valid('param');
        const repository = services.story!;
        const entry = await repository.findWikiEntryDocumentTarget(entryId);
        if (!entry) return wikiJson(wikiErrorBody('找不到该内容页'), 404);
        let createdKey: string | null = null;
        try {
            const upload = await parseUploadWikiEntryDocumentMediaRequest(
                context.req.raw,
                services
            );
            const file = singleWikiFile(upload, 'image');
            if (!file?.filename) {
                return wikiJson(wikiErrorBody('请选择要上传的图片'), 400);
            }
            const converted = await validateAndConvertStoryImage(
                file,
                services.images!
            );
            createdKey = documentMediaObjectKey(
                entry.projectCode,
                entryId,
                crypto.randomUUID()
            );
            await services.storage!.put(createdKey, converted, {
                contentType: 'image/webp',
                metadata: {
                    kind: 'wiki-entry-document-media',
                    entry: String(entryId),
                },
            });
            // Resolve the public read URL before writing the row: a deployment
            // without a public read base must fail here, not leave a media row
            // pointing at an object the response could never serve.
            const imageUrl = await documentImageUrl(services.storage!)(
                createdKey
            );
            const record = await repository.createWikiEntryDocumentMedia({
                entryId,
                projectId: entry.projectId,
                objectKey: createdKey,
                altText: documentMediaAltText(upload.fields, file.filename),
            });
            await writeWikiAudit(
                context,
                services,
                'wiki.document.media.upload',
                `entry:${entryId}`
            );
            return wikiJson({
                status: 'success',
                media: {
                    id: record.id,
                    imageUrl,
                    altText: record.altText,
                },
            });
        } catch (error) {
            if (createdKey) await cleanupWikiObjects(services, [createdKey]);
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
            return wikiJson(wikiErrorBody('保存文档图片失败'), 500);
        }
    };
}
