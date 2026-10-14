import type { ArticleAssetRequestContext } from '@/domains/content/editorial/request';
import {
    toEditorialArticleAssetListResponse,
    type EditorialArticleAssetListResponse
} from '@/domains/content/editorial/response';
import { editorialRepository } from '@/middleware/hono-context';

export async function handleListArticleAssets(
    c: ArticleAssetRequestContext
): Promise<Response> {
    const { articleId } = c.req.valid('param');
    const rows = await editorialRepository(c).listArticleAssets(articleId);
    return c.json(
        toEditorialArticleAssetListResponse(rows) satisfies EditorialArticleAssetListResponse
    );
}
