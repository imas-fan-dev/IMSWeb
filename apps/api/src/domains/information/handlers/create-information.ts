import type { AppEnvironment } from '@/app';
import { writeAudit } from '@/domains/audit/hono-service';
import {
    createInformationId,
    informationCardFromSubmission,
    updateInformationIndex,
    type InformationSubmission
} from '@/domains/information/content-store';
import type {
    InformationCardMutationResponse,
    InformationErrorResponse
} from '@/domains/information/response';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleCreateInformation(
    c: ValidatedRequestContext<AppEnvironment, 'json', InformationSubmission>
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.storage) throw new Error('Object storage unavailable');
    try {
        const submission = c.req.valid('json');
        const id = createInformationId();
        const card = informationCardFromSubmission(id, submission);
        await updateInformationIndex(runtime.storage, (index) => {
            if (!index.assets.includes(card.image)) {
                throw Object.assign(new Error('封面图片尚未托管'), { status: 409 });
            }
            return { ...index, cards: [card, ...index.cards] };
        });
        await writeAudit(c, '发布活动内容', card.title);
        return c.json({ success: true, card } satisfies InformationCardMutationResponse);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to create information card', error);
        return c.json({
            error: status >= 500 ? '活动内容保存失败' : messageFromError(error)
        } satisfies InformationErrorResponse, status as 400 | 409 | 500);
    }
}
