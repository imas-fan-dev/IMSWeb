import { writeAudit } from '@/domains/admin/audit/write-audit';
import {
    informationCardFromSubmission,
    updateInformationIndex
} from '@/domains/content/information/content-store';
import type { UpdateInformationRequestContext } from '@/domains/content/information/request';
import type {
    InformationCardMutationResponse,
    InformationErrorResponse
} from '@/domains/content/information/response';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { services } from '@/middleware/hono-context';

export async function handleUpdateInformation(
    c: UpdateInformationRequestContext
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.storage) throw new Error('Object storage unavailable');
    try {
        const submission = c.req.valid('json');
        const { id } = c.req.valid('param');
        const card = informationCardFromSubmission(id, submission);
        await updateInformationIndex(runtime.storage, (index) => {
            const position = index.cards.findIndex((candidate) => candidate.id === id);
            if (position < 0) throw Object.assign(new Error('活动内容不存在'), { status: 404 });
            if (!index.assets.includes(card.image)) {
                throw Object.assign(new Error('封面图片尚未托管'), { status: 409 });
            }
            const cards = [...index.cards];
            cards[position] = card;
            return { ...index, cards };
        });
        await writeAudit(c, '更新活动内容', card.title);
        return c.json({ success: true, card } satisfies InformationCardMutationResponse);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to update information card', error);
        return c.json({
            error: status >= 500 ? '活动内容保存失败' : messageFromError(error)
        } satisfies InformationErrorResponse, status as 400 | 404 | 409 | 500);
    }
}
