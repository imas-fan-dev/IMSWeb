import type { ArticleStatus } from '@/ports/repositories';
import { revision } from '@/domains/content/editorial/contracts/article-input';
import { statusResponse } from '@/domains/content/editorial/contracts/article-view';
import type { EditorialArticleRequestContext } from '@/domains/content/editorial/request';
import type {
    EditorialErrorResponse,
    EditorialStatusResponse
} from '@/domains/content/editorial/response';
import { editorialRepository } from '@/middleware/hono-context';

/** 编年史的发布门槛是年份与来源类型，与社区帖子的正文门槛不同。 */
export function createHandleChronicleEntryStatus(status: ArticleStatus) {
    return async function handleChronicleEntryStatus(
        c: EditorialArticleRequestContext
    ): Promise<Response> {
        const { id } = c.req.valid('param');
        const payload = c.req.valid('json');
        const repository = editorialRepository(c);
        const current = await repository.findAdminChronicle(id);
        if (!current) {
            return c.json({ error: '编年史不存在' } satisfies EditorialErrorResponse, 404);
        }
        if (status === 'published' && (!current.occurred_on || !current.source_type)) {
            return c.json(
                { error: '发布编年史至少需要年份和来源类型' } satisfies EditorialErrorResponse,
                400
            );
        }
        const result = await repository.setArticleStatus(
            id,
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
