import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { namecardPagesView } from '@/domains/community/fudaba/cards/artwork-view';
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
            // 装配只有一处（`namecardPagesView`）：列表也要带上待审页。
            const view = namecardPagesView(pagesByCard.get(card.id), {
                scope: 'owner',
                cardNumber: card.card_number,
                cardId: card.id
            });
            return fudabaOwnerCardView(card, view.live, view.pending ?? []);
        })
    });
}
