import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { publicArticleResponse } from '@/domains/content/editorial/contracts/article-view';
import {
    toEditorialSpotlightItemResponse,
    type EditorialSpotlightResponse
} from '@/domains/content/editorial/response';
import { editorialRepository, services } from '@/middleware/hono-context';

export async function handleListPublicSpotlight(
    c: Context<AppEnvironment>
): Promise<Response> {
    const rows = await editorialRepository(c).listPublicSpotlightEntries();
    const storage = services(c).storage;
    const resolved = storage
        ? await Promise.all(rows.map((row) => publicArticleResponse(row, storage)))
        : rows;
    return c.json({
        items: resolved.map(toEditorialSpotlightItemResponse)
    } satisfies EditorialSpotlightResponse);
}
