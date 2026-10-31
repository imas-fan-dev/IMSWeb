import type { EditorialPayloadRequestContext } from '@/domains/content/editorial/request';
import {
    toEditorialDraftResponse,
    type EditorialDraftResponse
} from '@/domains/content/editorial/response';
import { text } from '@/domains/content/editorial/contracts/article-input';
import { postKind } from '@/domains/content/editorial/posts/request';
import { editorialRepository } from '@/middleware/hono-context';

export async function handleCreateCommunityPost(
    c: EditorialPayloadRequestContext
): Promise<Response> {
    const payload = c.req.valid('json');
    const draft = await editorialRepository(c).createEventDraft({
        title: text(payload.title, '标题', 160, true)!,
        kind: postKind(payload.kind),
        userId: c.get('backofficeUser')!.id
    });
    return c.json(toEditorialDraftResponse(draft) satisfies EditorialDraftResponse, 201);
}
