import {
    enumValue,
    text
} from '@/domains/content/editorial/contracts/article-input';
import { CHRONICLE_SOURCE_TYPES } from '@/domains/content/editorial/chronicle/request';
import type { EditorialPayloadRequestContext } from '@/domains/content/editorial/request';
import {
    toEditorialDraftResponse,
    type EditorialDraftResponse
} from '@/domains/content/editorial/response';
import { editorialRepository } from '@/middleware/hono-context';

export async function handleCreateChronicleEntry(
    c: EditorialPayloadRequestContext
): Promise<Response> {
    const payload = c.req.valid('json');
    const draft = await editorialRepository(c).createChronicleDraft({
        title: text(payload.title, '标题', 160, true)!,
        sourceType: enumValue(payload.sourceType, CHRONICLE_SOURCE_TYPES, '来源类型'),
        userId: c.get('backofficeUser')!.id
    });
    return c.json(toEditorialDraftResponse(draft) satisfies EditorialDraftResponse, 201);
}
