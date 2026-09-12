import type { EditorialIdRequestContext } from '@/domains/content/editorial/request';
import type {
    EditorialErrorResponse,
    EditorialMutationResponse
} from '@/domains/content/editorial/response';
import { editorialRepository } from '@/middleware/hono-context';

export async function handleDeleteChronicleEntry(
    c: EditorialIdRequestContext
): Promise<Response> {
    const { id } = c.req.valid('param');
    const deleted = await editorialRepository(c).deleteEditorialChronicle(id);
    if (!deleted) return c.json({ error: '编年史不存在' } satisfies EditorialErrorResponse, 404);
    return c.json({ success: true } satisfies EditorialMutationResponse);
}
