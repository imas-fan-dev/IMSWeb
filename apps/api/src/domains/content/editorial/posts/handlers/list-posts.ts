import type { EditorialStatusRequestContext } from '@/domains/content/editorial/request';
import {
    toEditorialArticleListResponse,
    type EditorialArticleListResponse
} from '@/domains/content/editorial/response';
import { editorialRepository } from '@/middleware/hono-context';

export async function handleListCommunityPosts(
    c: EditorialStatusRequestContext
): Promise<Response> {
    const { status } = c.req.valid('query');
    const rows = await editorialRepository(c).listAdminEvents(status ?? undefined);
    return c.json(
        toEditorialArticleListResponse(rows) satisfies EditorialArticleListResponse
    );
}
