import type { AppEnvironment } from '@/app';
import type { AdminNamecardListQuery } from '@/domains/community/namecards/request';
import {
    toAdminNamecardResponse,
    type AdminNamecardListResponse
} from '@/domains/community/namecards/response';
import { purgeExpiredNamecardSubmissions } from '@/domains/community/fudaba/cards/ttl-purge';
import { cardArtworkView } from '@/domains/community/fudaba/cards/artwork-view';
import { services } from '@/middleware/hono-context';
import { namecardRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleListAdminNamecards(
    c: ValidatedRequestContext<AppEnvironment, 'query', AdminNamecardListQuery>
): Promise<Response> {
    const { page, query, status, origins } = c.req.valid('query');
    const filter = { query, status, origins };
    try {
        const repository = namecardRepository(c);
        await purgeExpiredNamecardSubmissions(c);
        const pageSize = 12;
        const [rows, total] = await Promise.all([
            repository.listAdminCards(pageSize, (page - 1) * pageSize, filter),
            repository.countAdminCards(filter)
        ]);
        const totalPages = Math.ceil(total / pageSize);
        const pagesByNumber =
            (await services(c).fudaba?.listCardPagesBatchByNumbers?.(
                rows.map((row) => Number(row.id))
            )) ?? new Map();
        return c.json({
            success: true,
            data: rows.map((row) => {
                const rowsForCard = pagesByNumber.get(Number(row.id));
                const pending =
                    row.reviewStatus !== null &&
                    (rowsForCard?.pending.length ?? 0) > 0;
                const pages = cardArtworkView({
                    scope: 'admin',
                    cardNumber: Number(row.id),
                    cardId: String(row.cardId ?? row.id),
                    live: rowsForCard?.live ?? [],
                    pending: pending ? (rowsForCard?.pending ?? []) : []
                });
                const pageViews = pending ? (pages.pending ?? []) : pages.live;
                return toAdminNamecardResponse(
                    row,
                    pageViews.length > 0 ? pageViews : undefined
                );
            }),
            pageInfo: {
                page,
                pageSize,
                total,
                totalPages,
                hasNextPage: page < totalPages
            }
        } satisfies AdminNamecardListResponse);
    } catch (error) {
        console.error('[admin-namecards]', error);
        return c.json({ success: false } satisfies AdminNamecardListResponse);
    }
}
