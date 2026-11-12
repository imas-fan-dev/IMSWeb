import type { AppEnvironment } from '@/app';
import type { AdminNamecardFeedbackListQuery } from '@/domains/community/namecards/request';
import type {
    AdminNamecardFeedbackListResponse,
    AdminNamecardFeedbackResponse
} from '@/domains/community/namecards/response';
import { fudabaRepository } from '@/middleware/hono-context';
import { namecardPageCount } from '@/domains/community/namecards/page-count';
import { cardArtworkView } from '@/domains/community/fudaba/cards/artwork-view';
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
        const pagesByNumber =
            (await fudabaRepository(c).listCardPagesBatchByNumbers?.(
                items.map((item) => item.cardNumber)
            )) ?? new Map();
        return c.json({
            success: true,
            data: items.map<AdminNamecardFeedbackResponse>((item) => {
                const rows = pagesByNumber.get(item.cardNumber);
                const pages = cardArtworkView({
                    scope: 'admin',
                    cardNumber: item.cardNumber,
                    cardId: String(item.cardNumber),
                    live: rows?.live ?? [],
                    pending: []
                }).live;
                // 页面行是唯一媒体来源：正/反/中间一律由页序推导。
                return {
                    id: item.id,
                    cardNumber: item.cardNumber,
                    producerName: item.producerName,
                    pageCount:
                        pages.length > 0
                            ? pages.length
                            : namecardPageCount({
                                hasBack: Boolean(item.backObjectKey),
                                middleCount: item.middlePageCount
                            }),
                    ...(pages.length > 0 ? { pages } : {}),
                    reporterName: item.reporterName,
                    reason: item.reason,
                    detail: item.detail,
                    createdAt: item.createdAt
                };
            }),
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
