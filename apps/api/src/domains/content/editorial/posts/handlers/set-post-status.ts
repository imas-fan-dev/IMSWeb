import type { ArticleStatus } from '@/ports/repositories';
import {
    documentHasPublicContent,
    statusResponse
} from '@/domains/content/editorial/contracts/article-view';
import {
    revision,
    sourceUrl
} from '@/domains/content/editorial/contracts/article-input';
import type { EditorialArticleRequestContext } from '@/domains/content/editorial/request';
import type {
    EditorialErrorResponse,
    EditorialStatusResponse
} from '@/domains/content/editorial/response';
import { editorialRepository } from '@/middleware/hono-context';

/**
 * 发布、撤回、归档共用一条流程：先取当前行，再按乐观锁改状态。
 * 发布额外要求正文有公开内容，或至少留下原页面链接。
 */
export function createHandleCommunityPostStatus(status: ArticleStatus) {
    return async function handleCommunityPostStatus(
        c: EditorialArticleRequestContext
    ): Promise<Response> {
        const { id } = c.req.valid('param');
        const payload = c.req.valid('json');
        const repository = editorialRepository(c);
        const current = await repository.findAdminEvent(id);
        if (!current) {
            return c.json({ error: '活动不存在' } satisfies EditorialErrorResponse, 404);
        }
        if (status === 'published') {
            const body = typeof current.body_json === 'string'
                ? JSON.parse(current.body_json) as unknown
                : current.body_json;
            if (!documentHasPublicContent(body) && !sourceUrl(current.source_url)) {
                return c.json(
                    { error: '发布社区帖子至少需要正文或原页面链接' } satisfies EditorialErrorResponse,
                    400
                );
            }
        }
        const result = await repository.setArticleStatus(
            Number(current.article_id),
            status,
            revision(payload.revision ?? current.revision),
            c.get('backofficeUser')!.id
        );
        const conflict = statusResponse(result, c);
        if (conflict) return conflict;
        return c.json(
            { status, revision: result.revision } satisfies EditorialStatusResponse
        );
    };
}
