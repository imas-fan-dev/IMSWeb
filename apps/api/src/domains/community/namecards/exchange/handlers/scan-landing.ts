import type { NamecardScanStatusContext } from '@/domains/community/namecards/exchange/request';
import { resolveExchangeCardMedia } from '@/domains/community/namecards/exchange/media';
import { scanTokenHash } from '@/domains/community/namecards/exchange/scan';
import {
    toPublicNamecardResponse,
    type NamecardErrorResponse,
    type NamecardScanLandingResponse,
} from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';

/** 与属主端点同一句话:不存在、形状不合法都不可区分。 */
const INVALID_LANDING_MESSAGE = '二维码无效或已失效';

/**
 * 扫码方 / 浏览器落地页的公开读取。
 *
 * 与属主轮询（`GET /exchange/scan/sessions/:token`）不同，这里允许任何人凭令牌读取：
 * 出示方、本次要交换的名片、有效期与状态。名片只在还能交换时返回，已用/过期的码
 * 不再把过期内容留在截图里；不返回消费记录或 `exchangeId`。
 */
export async function handleGetScanLandingStatus(
    c: NamecardScanStatusContext
): Promise<Response> {
    const { token } = c.req.valid('param');
    const repository = namecardRepository(c);
    const session = await repository.findScanSession(scanTokenHash(token));
    if (!session) {
        return c.json(
            { error: INVALID_LANDING_MESSAGE } satisfies NamecardErrorResponse,
            404
        );
    }
    const viewerId = c.get('platformUser')?.id ?? null;
    const state =
        viewerId === session.account_id
            ? 'own-card'
            : session.consumed_at !== null
              ? 'committed'
              : new Date(session.expires_at).getTime() <= Date.now()
                ? 'expired'
                : 'active';
    // 已用 / 过期只给状态：不再露出出示方或名片。
    const visible = state === 'active' || state === 'own-card';
    const owner = visible
        ? await repository.findPublicProfile(session.account_id)
        : null;
    if (visible && !owner) {
        // 账号已不可读：会话失去出示方，与不存在的码同一处理。
        return c.json(
            { error: INVALID_LANDING_MESSAGE } satisfies NamecardErrorResponse,
            404
        );
    }

    let cards: NamecardScanLandingResponse['cards'] = [];
    if (visible) {
        const wanted = new Set(session.card_numbers);
        const owned = await repository.listOwnedPublishedCardsAll(
            session.account_id
        );
        const selected = owned.filter((card) =>
            wanted.has(Number(card.card_number))
        );
        const collected =
            viewerId && viewerId !== session.account_id && selected.length > 0
                ? await repository.listCollectedCardNumbers({
                      collectorAccountId: viewerId,
                      cardNumbers: selected.map((card) =>
                          Number(card.card_number)
                      ),
                  })
                : new Set<number>();
        cards = await Promise.all(
            selected.map(async (card) => {
                const response = await resolveExchangeCardMedia(
                    c,
                    toPublicNamecardResponse(card, viewerId)
                );
                return collected.has(Number(card.card_number))
                    ? { ...response, collected: true }
                    : response;
            })
        );
    }

    const targetMissingCount =
        viewerId && state === 'active'
            ? await repository.countMissingCollectionCards({
                  cardOwnerId: viewerId,
                  otherAccountId: session.account_id,
              })
            : 0;

    return c.json({
        state,
        expiresAt: new Date(session.expires_at).toISOString(),
        owner: owner
            ? {
                  accountId: session.account_id,
                  uid: owner.uid,
                  pageSlug: owner.page_slug,
                  displayName: owner.display_name,
              }
            : null,
        cards,
        targetMissingCount,
    } satisfies NamecardScanLandingResponse);
}
