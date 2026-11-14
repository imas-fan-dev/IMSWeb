import type { EditorialIdRequestContext } from '@/domains/content/editorial/request';
import {
    toEditorialArticleResponse,
    type EditorialArticleResponse,
    type EditorialErrorResponse
} from '@/domains/content/editorial/response';
import { editorialRepository } from '@/middleware/hono-context';

export async function handleGetCommunityPost(
    c: EditorialIdRequestContext
): Promise<Response> {
    const { id } = c.req.valid('param');
    const row = await editorialRepository(c).findAdminEvent(id);
    if (!row) return c.json({ error: '活动不存在' } satisfies EditorialErrorResponse, 404);
    return c.json(toEditorialArticleResponse(row) satisfies EditorialArticleResponse);
}
