import type { AppEnvironment } from '@/app';
import type { NamecardShareContext } from '@/domains/community/namecards/exchange/request';
import type { NamecardRepository } from '@/ports/repositories/namecards';
import type {
    NamecardCardShareResponse,
    NamecardErrorResponse,
} from '@/domains/community/namecards/response';
import { toPublicNamecardResponse } from '@/domains/community/namecards/response';
import { resolveExchangeCardMedia } from '@/domains/community/namecards/exchange/media';
import { namecardRepository } from '@/middleware/hono-context';
import type { Context } from 'hono';

export type CardShareModelResult =
    | { ok: true; model: NamecardCardShareResponse }
    | { ok: false; error: string };

/**
 * 单卡分享页的读取逻辑。JSON handler 与站点 HTML handler（OGP 注入）共用同一份口径，
 * 所以浏览者视角由调用方给：接口用登录账号，爬虫固定 `null`。
 *
 * 卡片已下架、被锁定或还没认领都只算「不开放」：分享链接不替持有者解释原因，
 * 页面上只显示一句「这张名片当前不开放交换」。
 */
export async function loadCardShareModel(
    c: Context<AppEnvironment>,
    repository: NamecardRepository,
    slug: string,
    viewerId: string | null,
): Promise<CardShareModelResult> {
    const card = await repository.findCardByExchangeSlug(slug);
    if (!card || !card.owner_account_id) {
        return { ok: false, error: '这张名片当前不开放交换' };
    }
    const owner = await repository.findPublicProfile(card.owner_account_id);
    const state =
        viewerId === card.owner_account_id
            ? 'own-card'
            : card.exchange_mode === 'none'
              ? 'not-accepting'
              : 'available';
    const targetMissingCount =
        viewerId && state === 'available'
            ? await repository.countMissingCollectionCards({
                  cardOwnerId: viewerId,
                  otherAccountId: card.owner_account_id,
              })
            : 0;
    // 「已经收到这张卡」也是浏览者视角：未登录、或看的是自己的卡都不标。
    const collected =
        viewerId && viewerId !== card.owner_account_id
            ? (
                  await repository.listCollectedCardNumbers({
                      collectorAccountId: viewerId,
                      cardNumbers: [Number(card.card_number)],
                  })
              ).size > 0
            : false;
    const cardResponse = await resolveExchangeCardMedia(
        c,
        toPublicNamecardResponse(card, viewerId),
    );
    return {
        ok: true,
        model: {
            state,
            // 未命中的卡整份省略该字段，而不是写 `false`。
            card: collected ? { ...cardResponse, collected: true } : cardResponse,
            owner: {
                accountId: card.owner_account_id,
                uid: owner?.uid ?? 0,
                pageSlug: owner?.page_slug ?? null,
                displayName: owner?.display_name ?? '一位制作人',
            },
            targetMissingCount,
        },
    };
}

export async function handleGetCardShare(
    c: NamecardShareContext,
): Promise<Response> {
    const { slug } = c.req.valid('param');
    const result = await loadCardShareModel(
        c,
        namecardRepository(c),
        slug,
        c.get('platformUser')?.id ?? null,
    );
    if (!result.ok) {
        return c.json({ error: result.error } satisfies NamecardErrorResponse, 404);
    }
    return c.json(result.model satisfies NamecardCardShareResponse);
}
