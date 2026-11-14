import { randomUUID } from 'node:crypto';
import { NAMECARD_EXCHANGE_CARD_LIMIT } from '@imsweb/contracts/namecards/runtime';
import type {
    NamecardScanCommitContext,
    NamecardScanSessionContext,
} from '@/domains/community/namecards/exchange/request';
import { commitNamecardExchange } from '@/domains/community/namecards/exchange/commit';
import type {
    NamecardErrorResponse,
    NamecardScanSessionResponse,
} from '@/domains/community/namecards/response';
import {
    newScanToken,
    scanSessionExpiry,
    scanTokenHash,
} from '@/domains/community/namecards/exchange/scan';
import { namecardRepository } from '@/middleware/hono-context';

const INVALID_SCAN_MESSAGE = '二维码已失效，请让对方重新生成';

/** 出示方先登记这一轮要交换的名片,再把它变成一张一次性二维码。 */
export async function handleCreateScanSession(
    c: NamecardScanSessionContext,
): Promise<Response> {
    const accountId = c.get('platformUser')!.id;
    const { cardNumbers } = c.req.valid('json');
    const unique = [...new Set(cardNumbers)];
    if (unique.length === 0 || unique.length > NAMECARD_EXCHANGE_CARD_LIMIT) {
        return c.json({ error: '请选择要出示的名片' } satisfies NamecardErrorResponse, 400);
    }
    const repository = namecardRepository(c);
    // 只认自己名下、仍可交换的名片:被锁定或删掉的不进二维码。
    const available = new Set(
        (await repository.listExchangeCandidates(accountId)).map(
            (card) => card.card_number ?? card.id,
        ),
    );
    const usable = unique.filter((cardNumber) => available.has(cardNumber));
    if (usable.length === 0) {
        return c.json({ error: '所选名片已不可交换' } satisfies NamecardErrorResponse, 400);
    }
    const now = Date.now();
    const expiresAt = scanSessionExpiry(now);
    const { token, tokenHash } = newScanToken();
    await repository.createScanSession({
        id: randomUUID(),
        tokenHash,
        accountId,
        cardNumbers: usable,
        expiresAt,
    });
    return c.json({ token, expiresAt } satisfies NamecardScanSessionResponse);
}

/** 扫码方提交时,出示方早已选好名单,这里只补自己给出的那张。 */
export async function handleCommitScanSession(
    c: NamecardScanCommitContext,
): Promise<Response> {
    const accountId = c.get('platformUser')!.id;
    const { token } = c.req.valid('param');
    const body = c.req.valid('json');
    const repository = namecardRepository(c);
    const session = await repository.findScanSession(scanTokenHash(token));
    if (!session || session.consumed_at !== null) {
        return c.json({ error: INVALID_SCAN_MESSAGE } satisfies NamecardErrorResponse, 409);
    }
    if (new Date(session.expires_at).getTime() <= Date.now()) {
        return c.json({ error: INVALID_SCAN_MESSAGE } satisfies NamecardErrorResponse, 409);
    }
    return commitNamecardExchange(c, {
        clientExchangeId: body.clientExchangeId,
        source: 'scan',
        initiatorAccountId: accountId,
        target: {
            targetAccountId: session.account_id,
            targetCardNumbers: session.card_numbers,
        },
        giveCardNumbers: body.giveCardNumbers,
        scanSessionId: session.id,
    });
}
