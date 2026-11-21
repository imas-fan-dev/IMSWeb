import type { NamecardExchangeDetailContext } from '@/domains/community/namecards/exchange/request';
import type {
    NamecardErrorResponse,
    NamecardExchangeDetailResponse,
} from '@/domains/community/namecards/response';
import { toPublicNamecardResponse } from '@/domains/community/namecards/response';
import { resolveExchangeCardMedia } from '@/domains/community/namecards/exchange/media';
import { namecardRepository } from '@/middleware/hono-context';

/**
 * 通知窗口的详情：只有发起方或目标方能读，其它人一律 404（仓储的 SQL 里判定）。
 *
 * 卡片走分享页同一份投影（`toPublicNamecardResponse` + `resolveExchangeCardMedia`），
 * `pages[].thumbUrl` 直接拿来画缩略图；viewer 就是请求者。
 */
export async function handleGetExchange(
    c: NamecardExchangeDetailContext,
): Promise<Response> {
    const { id } = c.req.valid('param');
    const accountId = c.get('platformUser')!.id;
    const detail = await namecardRepository(c).findExchangeDetail({
        exchangeId: id,
        accountId,
    });
    if (!detail) {
        return c.json(
            { error: '找不到这条交换请求' } satisfies NamecardErrorResponse,
            404,
        );
    }
    const [targetCards, initiatorCards] = await Promise.all([
        Promise.all(
            detail.target_cards.map((card) =>
                resolveExchangeCardMedia(
                    c,
                    toPublicNamecardResponse(card, accountId),
                ),
            ),
        ),
        Promise.all(
            detail.initiator_cards.map((card) =>
                resolveExchangeCardMedia(
                    c,
                    toPublicNamecardResponse(card, accountId),
                ),
            ),
        ),
    ]);
    return c.json({
        id: detail.id,
        status: detail.status,
        source: detail.source,
        createdAt: new Date(detail.created_at).toISOString(),
        expiresAt: detail.expires_at,
        initiator: {
            accountId: detail.initiator.account_id,
            displayName: detail.initiator.display_name,
        },
        target: {
            accountId: detail.target.account_id,
            displayName: detail.target.display_name,
        },
        targetCards,
        initiatorCards,
        skipped: detail.skipped,
    } satisfies NamecardExchangeDetailResponse);
}
