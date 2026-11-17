import { randomUUID } from 'node:crypto';
import type { AppEnvironment } from '@/app';
import type { NamecardExchangeResult } from '@imsweb/contracts/namecards';
import type {
    NamecardExchangeSourceRecord,
} from '@/ports/repositories/namecards';
import { namecardRepository } from '@/middleware/hono-context';
import type { Context } from 'hono';

export interface ExchangeCommitTarget {
    /** null 表示目标账号还没认领这张卡。 */
    targetAccountId: string | null;
    targetCardNumbers: number[];
}

/**
 * 四个入口共用一次提交：幂等键由前端生成，重复提交拿回同一次交换。
 */
export async function commitNamecardExchange(
    c: Context<AppEnvironment>,
    input: {
        clientExchangeId: string;
        source: NamecardExchangeSourceRecord;
        initiatorAccountId: string;
        target: ExchangeCommitTarget;
        giveCardNumbers: number[];
        scanSessionId?: string | null;
    },
): Promise<Response> {
    if (!input.target.targetAccountId) {
        return c.json({ error: '这张名片还没有持有者' }, 404);
    }
    if (input.target.targetAccountId === input.initiatorAccountId) {
        return c.json({ error: '不能和自己交换名片' }, 400);
    }
    const result = await namecardRepository(c).commitExchange({
        id: randomUUID(),
        clientExchangeId: input.clientExchangeId,
        source: input.source,
        initiatorAccountId: input.initiatorAccountId,
        targetAccountId: input.target.targetAccountId,
        targetCardNumbers: input.target.targetCardNumbers,
        giveCardNumbers: input.giveCardNumbers,
        scanSessionId: input.scanSessionId ?? null,
        at: new Date().toISOString(),
    });
    const { exchange } = result;
    return c.json({
        exchangeId: exchange.id,
        status: exchange.status,
        targetCardNumbers: exchange.target_card_numbers,
        initiatorCardNumbers: exchange.initiator_card_numbers,
        skipped: exchange.skipped,
        targetMissingCount: result.targetMissingCount,
    } satisfies NamecardExchangeResult);
}
