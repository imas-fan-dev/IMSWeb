import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { cardArtworkView } from '@/domains/community/fudaba/cards/artwork-view';
import { fudabaOwnerCardView } from '@/domains/community/fudaba/contracts/card';
import { fudabaRepository } from '@/middleware/hono-context';

export async function handleListFudabaOwnerCards(
    c: Context<AppEnvironment>
): Promise<Response> {
    const repository = fudabaRepository(c);
    const cards = await repository.listCardsForOwner(c.get('platformUser')!.id);
    // 测试替身可能只实现列表所需的方法：缺批量查询时按无页面行处理。
    const pagesByCard =
        (await repository.listCardPagesBatch?.(
            cards.map((card) => card.id)
        )) ?? new Map();
    return c.json({
        items: cards.map((card) => {
            const rows = pagesByCard.get(card.id);
            const pages = cardArtworkView({
                scope: 'owner',
                cardNumber: card.card_number,
                cardId: card.id,
                live: rows?.live ?? [],
                pending: []
            }).live;
            const pendingPages =
                cardArtworkView({
                    scope: 'owner',
                    cardNumber: card.card_number,
                    cardId: card.id,
                    live: [],
                    pending: rows?.pending ?? []
                }).pending ?? [];
            return fudabaOwnerCardView(card, pages, pendingPages);
        })
    });
}
