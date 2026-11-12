import type { AppEnvironment } from '@/app';
import type { Namecard } from '@imsweb/contracts/namecards';
import { cardArtworkView } from '@/domains/community/fudaba/cards/artwork-view';
import { services } from '@/middleware/hono-context';
import type { Context } from 'hono';

/**
 * 交换与名片册的卡片媒体：页面行是唯一来源，按交换作用域拼地址。
 *
 * The wall and the profile hand out route addresses, and every other reader
 * must do the same: the exchange payloads once handed out raw object keys,
 * which the browser cannot load.
 */
export async function resolveExchangeCardMedia(
    c: Context<AppEnvironment>,
    card: Namecard,
): Promise<Namecard> {
    const pagesByNumber =
        (await services(c).fudaba?.listCardPagesBatchByNumbers?.([
            card.cardNumber,
        ])) ?? new Map();
    const rows = pagesByNumber.get(card.cardNumber);
    const pages = cardArtworkView({
        scope: 'public',
        publicRoute: 'exchange',
        cardNumber: card.cardNumber,
        cardId: card.cardId,
        live: rows?.live ?? [],
        pending: [],
    }).live;
    return pages.length > 0 ? { ...card, pages } : card;
}
