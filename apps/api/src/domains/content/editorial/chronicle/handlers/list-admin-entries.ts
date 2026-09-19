import type { EditorialStatusRequestContext } from '@/domains/content/editorial/request';
import {
    toEditorialArticleListResponse,
    type EditorialArticleListResponse
} from '@/domains/content/editorial/response';
import { editorialRepository } from '@/middleware/hono-context';

export async function handleListAdminChronicleEntries(
    c: EditorialStatusRequestContext
): Promise<Response> {
    const { status } = c.req.valid('query');
    const rows = await editorialRepository(c).listAdminChronicle(status ?? undefined);
    return c.json(
        toEditorialArticleListResponse(rows) satisfies EditorialArticleListResponse
    );
}
