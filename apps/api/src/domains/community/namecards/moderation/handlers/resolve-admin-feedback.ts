import { writeAudit } from '@/domains/admin/audit/write-audit';
import type { NamecardFeedbackResolveContext } from '@/domains/community/namecards/request';
import type { NamecardFeedbackResponse } from '@/domains/community/namecards/response';
import { fudabaRepository } from '@/middleware/hono-context';

/**
 * Leaving the queue. 「受理」 only records the decision here — the operator
 * already saved the card through `PUT /api/admin/cards/:id`, and the owner got
 * the per-field notice from that call. The reporter hears about it below.
 */
export async function handleResolveAdminNamecardFeedback(
    c: NamecardFeedbackResolveContext
): Promise<Response> {
    const { feedbackId } = c.req.valid('param');
    const body = c.req.valid('json');
    const note = body.note?.trim() ? body.note.trim() : null;
    // The rejection quotes the reason back to the reporter, so it is required.
    if (body.outcome === 'rejected' && !note) {
        return c.json(
            { success: false, message: '请填写驳回理由' } satisfies NamecardFeedbackResponse,
            400
        );
    }
    const handledBy = c.get('backofficeUser')?.username || 'anonymous';
    const record = await fudabaRepository(c).resolveCardFeedback({
        id: feedbackId,
        outcome: body.outcome,
        note,
        handledBy,
        updatedAt: new Date().toISOString()
    });
    if (!record) {
        return c.json(
            { success: false, message: '反馈已被处理' } satisfies NamecardFeedbackResponse,
            404
        );
    }
    await writeAudit(
        c,
        body.outcome === 'accepted' ? '受理反馈' : '驳回反馈',
        `feedback_id=${record.id};card=${record.cardNumber};reporter=${record.reporterAccountId};reason=${record.reason};reported_at=${record.createdAt};outcome=${body.outcome};note=${note ?? ''}`
    );
    return c.json({ success: true } satisfies NamecardFeedbackResponse, 200);
}
