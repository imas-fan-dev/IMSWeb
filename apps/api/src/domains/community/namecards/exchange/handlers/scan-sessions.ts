import { randomUUID } from 'node:crypto';
import { NAMECARD_EXCHANGE_CARD_LIMIT } from '@imsweb/contracts/namecards/runtime';
import type {
    NamecardScanCommitContext,
    NamecardScanSessionContext,
    NamecardScanStatusContext,
} from '@/domains/community/namecards/exchange/request';
import { commitNamecardExchange } from '@/domains/community/namecards/exchange/commit';
import type {
    NamecardErrorResponse,
    NamecardScanSessionResponse,
    NamecardScanSessionStatusResponse,
} from '@/domains/community/namecards/response';
import {
    newScanToken,
    scanSessionExpiry,
    scanTokenHash,
} from '@/domains/community/namecards/exchange/scan';
import { namecardRepository, services } from '@/middleware/hono-context';
import { openPlatformChangeStream } from '@/middleware/platform-change-stream';

const INVALID_SCAN_MESSAGE = '二维码已失效，请让对方重新生成';
/** 不存在与不属于自己一律同一句话：不能靠状态码试出别人的二维码。 */
const MISSING_SCAN_MESSAGE = '找不到这个二维码';

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

/** 出示方的权威状态快照，也兼容仍在轮询的旧客户端。 */
export async function handleGetScanSessionStatus(
    c: NamecardScanStatusContext,
): Promise<Response> {
    c.header('Cache-Control', 'private, no-store');
    const accountId = c.get('platformUser')!.id;
    const { token } = c.req.valid('param');
    const session = await namecardRepository(c).findOwnedScanSession(
        scanTokenHash(token),
        accountId,
    );
    // 别人的二维码与不存在的二维码回同一句话（doc §2.4 一次性口令不泄露存在性）。
    if (!session) {
        return c.json({ error: MISSING_SCAN_MESSAGE } satisfies NamecardErrorResponse, 404);
    }
    // 消费优先于过期：已完成的交换就是事实，哪怕后来时间越过了 expires_at。
    const status =
        session.consumed_at !== null
            ? 'committed'
            : new Date(session.expires_at).getTime() <= Date.now()
              ? 'expired'
              : 'active';
    return c.json({
        status,
        expiresAt: new Date(session.expires_at).toISOString(),
        exchangeId: status === 'committed' ? session.consumed_by_exchange_id : null,
    } satisfies NamecardScanSessionStatusResponse);
}

/** Only the presenter may subscribe; the stream carries no token or exchange data. */
export async function handleScanSessionStream(c: NamecardScanStatusContext): Promise<Response> {
    c.header('Cache-Control', 'private, no-store, no-transform');
    const accountId = c.get('platformUser')!.id;
    const { token } = c.req.valid('param');
    const session = await namecardRepository(c).findOwnedScanSession(scanTokenHash(token), accountId);
    if (!session) {
        return c.json({ error: MISSING_SCAN_MESSAGE } satisfies NamecardErrorResponse, 404);
    }
    if (c.req.raw.method === 'HEAD') return c.body(null, 204);

    const events = services(c).namecardNotificationEvents;
    const stream = openPlatformChangeStream(c, 'scan.changed', (subscriber) =>
        events?.subscribeScan?.(accountId, session.id, subscriber),
        new Date(session.expires_at).getTime(),
    );
    if (stream) return c.body(stream, 200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Accel-Buffering': 'no'
    });
    c.header('Retry-After', '5');
    return c.json({ error: '扫码实时连接暂不可用' } satisfies NamecardErrorResponse, 503);
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
    if (!session) {
        return c.json({ error: INVALID_SCAN_MESSAGE } satisfies NamecardErrorResponse, 409);
    }
    // 幂等优先：这把 `clientExchangeId` 已经落过库时，重放必须拿回那一条记录，
    // 哪怕二维码正是被那次成功消费掉的（doc §7「重放使用同一 token 仍然有效」）。
    // 换一把新幂等键才是「再用一次二维码」，仍然按一次性规则拒绝。
    const replayed = await repository.findExchangeByClientId(body.clientExchangeId);
    if (!replayed) {
        if (session.consumed_at !== null) {
            return c.json({ error: INVALID_SCAN_MESSAGE } satisfies NamecardErrorResponse, 409);
        }
        if (new Date(session.expires_at).getTime() <= Date.now()) {
            return c.json({ error: INVALID_SCAN_MESSAGE } satisfies NamecardErrorResponse, 409);
        }
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
