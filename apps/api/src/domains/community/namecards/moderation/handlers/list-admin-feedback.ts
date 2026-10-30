import { adminNamecardMediaPath } from '@imsweb/contracts/paths';
import type { AppEnvironment } from '@/app';
import type { AdminNamecardFeedbackListQuery } from '@/domains/community/namecards/request';
import type {
    AdminNamecardFeedbackListResponse,
    AdminNamecardFeedbackResponse
} from '@/domains/community/namecards/response';
import { fudabaRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

const PAGE_SIZE = 12;

/**
 * The report queue: published cards readers flagged, oldest first, with the
 * reporter name so the operator knows who to answer.
 */
export async function handleListAdminNamecardFeedback(
    c: ValidatedRequestContext<AppEnvironment, 'query', AdminNamecardFeedbackListQuery>
): Promise<Response> {
    const { page } = c.req.valid('query');
    try {
        const { items, total } = await fudabaRepository(c).listPendingCardFeedback(
            { page, pageSize: PAGE_SIZE }
        );
        const totalPages = Math.ceil(total / PAGE_SIZE);
        return c.json({
            success: true,
            data: items.map<AdminNamecardFeedbackResponse>((item) => ({
                id: item.id,
                cardNumber: item.cardNumber,
                producerName: item.producerName,
                image1_url: adminNamecardMediaPath(item.cardNumber, 'live', 'front'),
                image2_url: item.backObjectKey
                    ? adminNamecardMediaPath(item.cardNumber, 'live', 'back')
                    : null,
                pageCount:
                    item.middlePageCount + 1 + (item.backObjectKey ? 1 : 0),
                reporterName: item.reporterName,
                reason: item.reason,
                detail: item.detail,
                createdAt: item.createdAt
            })),
            pageInfo: {
                page,
                pageSize: PAGE_SIZE,
                total,
                totalPages,
                hasNextPage: page < totalPages
            }
        } satisfies AdminNamecardFeedbackListResponse);
    } catch (error) {
        console.error('[admin-namecard-feedback]', error);
        return c.json({ success: false } satisfies AdminNamecardFeedbackListResponse, 500);
    }
}
