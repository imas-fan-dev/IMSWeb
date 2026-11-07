import type { NamecardQuickContext } from '@/domains/community/namecards/exchange/request';
import type {
    NamecardErrorResponse,
    NamecardQuickExchangeResponse,
} from '@/domains/community/namecards/response';
import { toPublicNamecardResponse } from '@/domains/community/namecards/response';
import { resolveExchangeCardMedia } from '@/domains/community/namecards/exchange/media';
import { namecardRepository } from '@/middleware/hono-context';

/** 快速交换页：对方勾选过的、此刻仍然可交换的名片。 */
export async function handleGetQuickExchange(
    c: NamecardQuickContext,
): Promise<Response> {
    const { handle } = c.req.valid('param');
    const repository = namecardRepository(c);
    const target = await repository.findExchangeTarget(handle);
    if (!target) {
        return c.json({ error: '找不到这位制作人' } satisfies NamecardErrorResponse, 404);
    }
    const viewerId = c.get('platformUser')?.id ?? null;
    const cards = target.cards.length
        ? await repository.listQuickExchangeCards(target.profile.account_id)
        : [];
    const targetMissingCount =
        viewerId && viewerId !== target.profile.account_id
            ? await repository.countMissingCollectionCards({
                  cardOwnerId: viewerId,
                  otherAccountId: target.profile.account_id,
              })
            : 0;
    return c.json({
        handle,
        accountId: target.profile.account_id,
        uid: target.profile.uid,
        displayName: target.profile.display_name,
        cards: await Promise.all(
            cards.map(async (card) =>
                resolveExchangeCardMedia(
                    c,
                    toPublicNamecardResponse(card, viewerId),
                ),
            ),
        ),
        targetMissingCount,
    } satisfies NamecardQuickExchangeResponse);
}
