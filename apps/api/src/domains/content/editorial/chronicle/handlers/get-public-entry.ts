import { publicArticleResponse } from '@/domains/content/editorial/contracts/article-view';
import type { EditorialIdRequestContext } from '@/domains/content/editorial/request';
import {
    toEditorialArticleResponse,
    type EditorialArticleResponse,
    type EditorialErrorResponse
} from '@/domains/content/editorial/response';
import { editorialRepository, services } from '@/middleware/hono-context';

export async function handleGetPublicChronicleEntry(
    c: EditorialIdRequestContext
): Promise<Response> {
    const { id } = c.req.valid('param');
    const row = await editorialRepository(c).findPublicChronicle(id);
    if (!row) return c.json({ error: '编年史不存在' } satisfies EditorialErrorResponse, 404);
    const resolved = await publicArticleResponse(row, services(c).storage);
    return c.json(toEditorialArticleResponse(resolved) satisfies EditorialArticleResponse);
}
