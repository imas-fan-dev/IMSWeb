import {
    articleFields
} from '@/domains/content/editorial/contracts/article-input';
import { statusResponse } from '@/domains/content/editorial/contracts/article-view';
import {
    postDetailFields,
    postKind
} from '@/domains/content/editorial/posts/request';
import type { EditorialArticleRequestContext } from '@/domains/content/editorial/request';
import type {
    EditorialErrorResponse,
    EditorialRevisionResponse
} from '@/domains/content/editorial/response';
import { editorialRepository } from '@/middleware/hono-context';

export async function handleUpdateCommunityPost(
    c: EditorialArticleRequestContext
): Promise<Response> {
    const { id } = c.req.valid('param');
    const payload = c.req.valid('json');
    const repository = editorialRepository(c);
    const current = await repository.findAdminEvent(id);
    if (!current) {
        return c.json({ error: '活动不存在' } satisfies EditorialErrorResponse, 404);
    }
    const fields = await articleFields(
        c,
        repository,
        Number(current.article_id),
        payload,
        current
    );
    const kind = postKind(payload.kind, current.kind);
    const result = await repository.updateEditorialEvent(id, {
        ...fields,
        ...postDetailFields(payload, current, kind)
    });
    const conflict = statusResponse(result, c);
    if (conflict) return conflict;
    return c.json({ revision: result.revision } satisfies EditorialRevisionResponse);
}
