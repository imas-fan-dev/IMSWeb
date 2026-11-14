import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { encodeFudabaCardCursor, parseFudabaCardQuery } from '@/domains/community/fudaba/directory/request';
import { fudabaPublicCardView } from '@/domains/community/fudaba/directory/response';
import { cardArtworkView } from '@/domains/community/fudaba/cards/artwork-view';
import { fudabaRepository, services } from '@/middleware/hono-context';

export async function handleListFudabaPublicCards(
    c: Context<AppEnvironment>
): Promise<Response> {
    const query = parseFudabaCardQuery(c.req.url);
    const { available, ...filters } = query.filters;
    const rows = await fudabaRepository(c).listPublicCards({
        ...filters,
        ...(available === undefined ? {} : { exchangeable: available }),
        viewerAccountId: c.get('platformUser')?.id ?? null,
        limit: query.limit + 1,
        ...(query.after ? { after: query.after } : {})
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    // 测试替身可能只实现列表所需的方法：缺批量查询时按无页面行处理。
    const pagesByCard =
        (await fudabaRepository(c).listCardPagesBatch?.(
            page.map((card) => card.id)
        )) ?? new Map();
    const items = await Promise.all(page.map((card) => {
        const rows = pagesByCard.get(card.id);
        const pages = cardArtworkView({
            scope: 'public',
            publicRoute: 'exchange',
            cardNumber: 0,
            cardId: card.id,
            live: rows?.live ?? [],
            pending: []
        }).live;
        return fudabaPublicCardView(services(c).storage, card, pages);
    }));
    const last = page.at(-1);
    return c.json({
        items,
        pageInfo: {
            hasNextPage,
            nextCursor: hasNextPage && last
                ? encodeFudabaCardCursor(query.filters, {
                    createdAt: last.created_at,
                    id: last.id
                })
                : null
        }
    });
}
