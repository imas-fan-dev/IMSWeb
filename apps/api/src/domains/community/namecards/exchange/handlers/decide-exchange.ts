import type { NamecardDecisionContext } from '@/domains/community/namecards/exchange/request';
import type {
    NamecardErrorResponse,
    NamecardExchangeDecisionResponse,
} from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';

async function decide(
    c: NamecardDecisionContext,
    decision: 'accept' | 'decline',
): Promise<Response> {
    const { id } = c.req.valid('param');
    const result = await namecardRepository(c).decideExchange({
        exchangeId: id,
        accountId: c.get('platformUser')!.id,
        decision,
        at: new Date().toISOString(),
    });
    if (result.status === 'not-found') {
        return c.json(
            { error: '找不到这条交换请求' } satisfies NamecardErrorResponse,
            404,
        );
    }
    if (result.status === 'expired') {
        return c.json(
            { error: '这条交换请求已经处理过了' } satisfies NamecardErrorResponse,
            409,
        );
    }
    return c.json({
        success: true,
        status: result.status,
    } satisfies NamecardExchangeDecisionResponse);
}

export async function handleAcceptExchange(
    c: NamecardDecisionContext,
): Promise<Response> {
    return decide(c, 'accept');
}

export async function handleDeclineExchange(
    c: NamecardDecisionContext,
): Promise<Response> {
    return decide(c, 'decline');
}
