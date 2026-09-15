import { writeAudit } from '@/domains/admin/audit/write-audit';
import { updateInformationIndex } from '@/domains/content/information/content-store';
import type { InformationCardRequestContext } from '@/domains/content/information/request';
import type {
    InformationErrorResponse,
    InformationMutationResponse
} from '@/domains/content/information/response';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { services } from '@/middleware/hono-context';

export async function handleDeleteInformation(
    c: InformationCardRequestContext
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.storage) throw new Error('Object storage unavailable');
    const { id } = c.req.valid('param');
    let title = id;
    try {
        await updateInformationIndex(runtime.storage, (index) => {
            const card = index.cards.find((candidate) => candidate.id === id);
            if (!card) throw Object.assign(new Error('活动内容不存在'), { status: 404 });
            title = card.title;
            return { ...index, cards: index.cards.filter((candidate) => candidate.id !== id) };
        });
        await writeAudit(c, '删除活动内容', title);
        return c.json({ success: true } satisfies InformationMutationResponse);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to delete information card', error);
        return c.json({
            error: status >= 500 ? '活动内容删除失败' : messageFromError(error)
        } satisfies InformationErrorResponse, status as 404 | 409 | 500);
    }
}
