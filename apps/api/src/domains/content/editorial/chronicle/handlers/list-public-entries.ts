import { encodeChronicleCursor } from '@/domains/content/editorial/chronicle/request';
import type { EditorialChronicleRequestContext } from '@/domains/content/editorial/request';
import {
    toEditorialArticleResponse,
    type EditorialChroniclePageResponse
} from '@/domains/content/editorial/response';
import { editorialRepository } from '@/middleware/hono-context';

export async function handleListPublicChronicleEntries(
    c: EditorialChronicleRequestContext
): Promise<Response> {
    const { limit, cursor } = c.req.valid('query');
    // 多取一行判断是否还有下一页，返回时再裁掉。
    const rows = await editorialRepository(c).listPublicChronicle(limit + 1, cursor);
    const hasNextPage = rows.length > limit;
    const page = hasNextPage ? rows.slice(0, limit) : rows;
    return c.json({
        items: page.map(toEditorialArticleResponse),
        pageInfo: {
            hasNextPage,
            nextCursor: hasNextPage && page.length
                ? encodeChronicleCursor(page.at(-1)!)
                : null
        }
    } satisfies EditorialChroniclePageResponse);
}
