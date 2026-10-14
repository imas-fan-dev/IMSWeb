import type { ArticleAssetRequestContext } from '@/domains/content/editorial/request';
import type {
    EditorialErrorResponse,
    EditorialMutationResponse
} from '@/domains/content/editorial/response';
import { editorialRepository, services } from '@/middleware/hono-context';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { invalidRequest } from '@/utils/validation/request-data';

export async function handleDeleteArticleAsset(
    c: ArticleAssetRequestContext
): Promise<Response> {
    const { articleId, assetId } = c.req.valid('param');
    if (!assetId) invalidRequest('素材 ID 无效');
    const repository = editorialRepository(c);
    const asset = await repository.findArticleAsset(articleId, assetId);
    if (!asset) return c.json({ error: '素材不存在' } satisfies EditorialErrorResponse, 404);
    const article = await repository.findEditorialArticle(articleId);
    const publicPath = String(asset.public_path);
    // 仍被封面或正文引用的素材不能删，否则已发布的文章会留下坏图。
    if (article?.cover_url === publicPath ||
        JSON.stringify(article?.body_json || '').includes(publicPath)) {
        return c.json(
            { error: '素材仍在正文或封面中使用' } satisfies EditorialErrorResponse,
            409
        );
    }
    const deleted = await repository.deleteArticleAsset(articleId, assetId);
    if (!deleted) return c.json({ error: '素材不存在' } satisfies EditorialErrorResponse, 404);
    const runtime = services(c);
    if (runtime.storage && asset.object_key) {
        await deleteObjectWithCompensation(runtime, String(asset.object_key));
    }
    return c.json({ success: true } satisfies EditorialMutationResponse);
}
