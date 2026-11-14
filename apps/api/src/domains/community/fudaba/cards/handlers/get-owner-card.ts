import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { fudabaOwnerCardView, validFudabaCardId } from '@/domains/community/fudaba/contracts/card';
import { fudabaRepository } from '@/middleware/hono-context';
import { cardArtworkView } from '@/domains/community/fudaba/cards/artwork-view';

export async function handleGetFudabaOwnerCard(
    c: Context<AppEnvironment>
): Promise<Response> {
    const cardId = c.req.param('cardId') || '';
    if (!validFudabaCardId(cardId)) {
        return c.json({ success: false, code: 'FUDABA_CARD_NOT_FOUND' }, 404);
    }
    const card = await fudabaRepository(c).findCardForOwner(
        cardId,
        c.get('platformUser')!.id
    );
    if (!card) {
        return c.json({ success: false, code: 'FUDABA_CARD_NOT_FOUND' }, 404);
    }
    // 测试替身可能只实现详情所需的方法：缺页面查询时按无页面处理。
    const pages =
        (await fudabaRepository(c).listCardPages?.(card.id)) ?? {
            live: [],
            pending: []
        };
    const live = cardArtworkView({
        scope: 'owner',
        cardNumber: card.card_number,
        cardId: card.id,
        live: pages.live,
        pending: []
    }).live;
    const pending = cardArtworkView({
        scope: 'owner',
        cardNumber: card.card_number,
        cardId: card.id,
        live: [],
        pending: pages.pending
    }).pending ?? [];
    return c.json({ card: fudabaOwnerCardView(card, live, pending) });
}
