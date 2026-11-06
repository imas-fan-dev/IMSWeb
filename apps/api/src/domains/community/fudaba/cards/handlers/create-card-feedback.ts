import type { AppEnvironment } from '@/app';
import type { CreateNamecardFeedbackRequest } from '@imsweb/contracts/namecards';
import { validFudabaCardId } from '@/domains/community/fudaba/contracts/card';
import { fudabaRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

/**
 * Wall readers report a published card. The report lands in the backoffice
 * queue; one open report per reader per card keeps the queue readable.
 */
export async function handleCreateFudabaCardFeedback(
    c: ValidatedRequestContext<AppEnvironment, 'json', CreateNamecardFeedbackRequest>
): Promise<Response> {
    try {
        const cardId = c.req.param('cardId') || '';
        if (!validFudabaCardId(cardId)) {
            return c.json({ error: '名片不存在' }, 404);
        }
        const body = c.req.valid('json');
        const result = await fudabaRepository(c).createCardFeedback({
            cardId,
            reporterAccountId: c.get('platformUser')!.id,
            reason: body.reason,
            detail: body.detail,
            createdAt: new Date().toISOString()
        });
        if (result === 'not-found') {
            return c.json({ error: '名片不存在' }, 404);
        }
        if (result === 'duplicate') {
            return c.json({ error: '你已经有待处理的反馈，请等待处理结果' }, 409);
        }
        return c.json({ success: true }, 200);
    } catch (error) {
        const status = statusFromError(error);
        return c.json({ message: messageFromError(error) }, status as 400 | 409 | 500);
    }
}
