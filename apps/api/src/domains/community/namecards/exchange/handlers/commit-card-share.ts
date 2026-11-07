import type { NamecardShareCommitContext } from '@/domains/community/namecards/exchange/request';
import { commitNamecardExchange } from '@/domains/community/namecards/exchange/commit';
import type { NamecardErrorResponse } from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';

/** 从分享页收下这张卡；`manual` 由持有者确认，`auto` 直接完成。 */
export async function handleCommitCardShare(
    c: NamecardShareCommitContext,
): Promise<Response> {
    const { slug } = c.req.valid('param');
    const { clientExchangeId, giveCardNumbers } = c.req.valid('json');
    const card = await namecardRepository(c).findCardByExchangeSlug(slug);
    if (!card) {
        return c.json(
            { error: '这张名片当前不开放交换' } satisfies NamecardErrorResponse,
            404,
        );
    }
    return commitNamecardExchange(c, {
        clientExchangeId,
        source: 'card-share',
        initiatorAccountId: c.get('platformUser')!.id,
        target: {
            targetAccountId: card.owner_account_id ?? null,
            targetCardNumbers: [card.card_number ?? card.id],
        },
        giveCardNumbers,
    });
}
