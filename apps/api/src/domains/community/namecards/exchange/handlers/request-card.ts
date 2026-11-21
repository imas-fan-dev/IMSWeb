import type { NamecardRequestContext } from '@/domains/community/namecards/exchange/request';
import { commitNamecardExchange } from '@/domains/community/namecards/exchange/commit';
import type { NamecardErrorResponse } from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';

/** 名片墙上直接发起：目标就是墙上的这张卡。 */
export async function handleRequestCard(
    c: NamecardRequestContext,
): Promise<Response> {
    const { cardNumber } = c.req.valid('param');
    const { clientExchangeId, giveCardNumbers } = c.req.valid('json');
    const card = await namecardRepository(c).findApprovedCard(Number(cardNumber));
    if (!card) {
        return c.json(
            { error: '这张名片当前不开放交换' } satisfies NamecardErrorResponse,
            404,
        );
    }
    // R10：`none` 卡不接受别人向它发起交换。静默成功只会产生一次空交换，
    // 调用方（墙 / 分享页 / 选卡窗口）也就无从提示。
    if (card.exchange_mode === 'none') {
        return c.json(
            { error: '这张名片不接受交换' } satisfies NamecardErrorResponse,
            409,
        );
    }
    return commitNamecardExchange(c, {
        clientExchangeId,
        source: 'card-request',
        initiatorAccountId: c.get('platformUser')!.id,
        target: {
            targetAccountId: card.owner_account_id ?? null,
            targetCardNumbers: [card.card_number ?? card.id],
        },
        giveCardNumbers,
    });
}
