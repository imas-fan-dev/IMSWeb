import type { NamecardGiftContext } from '@/domains/community/namecards/exchange/request';
import { commitNamecardExchange } from '@/domains/community/namecards/exchange/commit';
import type { NamecardErrorResponse } from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';

/**
 * 单向送礼：把我在他人主页上挑中的名片直接放进对方名片册。
 * 对方既不用确认，也不会收到通知；已在对方册子里的一张静默跳过。
 */
export async function handleGiftCard(c: NamecardGiftContext): Promise<Response> {
    const { accountId } = c.req.valid('param');
    const { clientExchangeId, cardNumbers } = c.req.valid('json');
    const initiatorAccountId = c.get('platformUser')!.id;
    if (accountId === initiatorAccountId) {
        return c.json({ error: '不能给自己送名片' } satisfies NamecardErrorResponse, 400);
    }
    const repository = namecardRepository(c);
    const target = await repository.findPublicProfile(accountId);
    if (!target) {
        return c.json({ error: '找不到这位制作人' } satisfies NamecardErrorResponse, 404);
    }
    // 没有目标卡：`commitNamecardExchange` 直接落成 completed，只把给出方名片
    // 写进对方的名片册，并把 `none` 模式的卡也算作可送。
    return commitNamecardExchange(c, {
        clientExchangeId,
        source: 'gift',
        initiatorAccountId,
        target: {
            targetAccountId: target.account_id,
            targetCardNumbers: [],
        },
        giveCardNumbers: cardNumbers,
    });
}
