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
