import type { SpotlightSelectionRequestContext } from '@/domains/content/editorial/request';
import type {
    EditorialErrorResponse,
    EditorialMutationResponse
} from '@/domains/content/editorial/response';
import { editorialRepository } from '@/middleware/hono-context';

export async function handleReplaceAdminSpotlight(
    c: SpotlightSelectionRequestContext
): Promise<Response> {
    const { items } = c.req.valid('json');
    const result = await editorialRepository(c).replaceHomepageSpotlightEntries(items);
    if (result.status === 'invalid') {
        return c.json(
            { error: '首页精选只能包含已发布的社区帖子' } satisfies EditorialErrorResponse,
            400
        );
    }
    return c.json({ success: true } satisfies EditorialMutationResponse);
}
