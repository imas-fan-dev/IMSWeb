import type { NamecardQuickCommitContext } from '@/domains/community/namecards/exchange/request';
import { commitNamecardExchange } from '@/domains/community/namecards/exchange/commit';
import type { NamecardErrorResponse } from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';

/** 一次收下对方快速清单里的全部名片。 */
export async function handleCommitQuickExchange(
    c: NamecardQuickCommitContext,
): Promise<Response> {
    const { handle } = c.req.valid('param');
    const { clientExchangeId, giveCardNumbers } = c.req.valid('json');
    const repository = namecardRepository(c);
    const target = await repository.findExchangeTarget(handle);
    if (!target) {
        return c.json({ error: '找不到这位制作人' } satisfies NamecardErrorResponse, 404);
    }
    const cards = await repository.listQuickExchangeCards(target.profile.account_id);
    if (cards.length === 0) {
        return c.json(
            { error: '对方当前没有可交换的名片' } satisfies NamecardErrorResponse,
            409,
        );
    }
    return commitNamecardExchange(c, {
        clientExchangeId,
        source: 'quick',
        initiatorAccountId: c.get('platformUser')!.id,
        target: {
            targetAccountId: target.profile.account_id,
            targetCardNumbers: cards.map((card) => card.card_number ?? card.id),
        },
        giveCardNumbers,
    });
}
