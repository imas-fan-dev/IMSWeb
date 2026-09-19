import { publicUploadsPath } from '@imsweb/contracts/paths';
import {
    parseUploadArticleAssetRequest,
    type ArticleAssetRequestContext
} from '@/domains/content/editorial/request';
import {
    toEditorialArticleAssetResponse,
    type EditorialArticleAssetResponse,
    type EditorialErrorResponse
} from '@/domains/content/editorial/response';
import { editorialRepository, services } from '@/middleware/hono-context';
import { randomHex } from '@/utils/crypto/random';
import { safeUploadBaseName } from '@/utils/media/filename';
import { validateUploadedImage } from '@/utils/media/image-upload';
import { articleAssetObjectKey } from '@/utils/storage/business-object-keys';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

function ignoreCleanupError(): undefined {
    return undefined;
}

export async function handleUploadArticleAsset(
    c: ArticleAssetRequestContext
): Promise<Response> {
    const { articleId } = c.req.valid('param');
    const repository = editorialRepository(c);
    const article = await repository.findEditorialArticle(articleId);
    if (!article) return c.json({ error: '文章不存在' } satisfies EditorialErrorResponse, 404);
    const runtime = services(c);
    if (!runtime.images || !runtime.storage) throw new Error('上传服务不可用');
    const upload = await parseUploadArticleAssetRequest(c);
    const info = await validateUploadedImage(upload.image, runtime.images);
    const webp = await runtime.images.toWebp(upload.image.body);
    const stem = `${safeUploadBaseName(upload.image.filename)}-${Date.now()}-${randomHex(6)}`;
    const filename = `${stem}.webp`;
    const objectKey = articleAssetObjectKey(articleId, filename);
    const publicPath = publicUploadsPath(`/articles/${articleId}/${filename}`);
    await runtime.storage.put(objectKey, webp, {
        contentType: 'image/webp',
        deferredPublication: true
    });
    try {
        const asset = await repository.insertArticleAsset({
            articleId,
            objectKey,
            publicPath,
            usage: upload.usage,
            altText: upload.altText,
            userId: c.get('backofficeUser')!.id
        });
        await runtime.storage.publish?.(objectKey);
        return c.json(
            toEditorialArticleAssetResponse(asset, info.format) satisfies EditorialArticleAssetResponse,
            201
        );
    } catch (error) {
        await deleteObjectWithCompensation(runtime, objectKey).catch(ignoreCleanupError);
        throw error;
    }
}
