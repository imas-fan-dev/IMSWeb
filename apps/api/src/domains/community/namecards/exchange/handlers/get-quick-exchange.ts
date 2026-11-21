import type { AppEnvironment } from '@/app';
import type { NamecardQuickContext } from '@/domains/community/namecards/exchange/request';
import type { NamecardRepository } from '@/ports/repositories/namecards';
import type {
    NamecardErrorResponse,
    NamecardQuickExchangeResponse,
} from '@/domains/community/namecards/response';
import { toPublicNamecardResponse } from '@/domains/community/namecards/response';
import { resolveExchangeCardMedia } from '@/domains/community/namecards/exchange/media';
import { namecardRepository } from '@/middleware/hono-context';
import type { Context } from 'hono';

export type QuickExchangeModelResult =
    | { ok: true; model: NamecardQuickExchangeResponse }
    | { ok: false; error: string };

/**
 * 快速交换页的读取逻辑：对方勾选过、此刻仍然可交换的名片。JSON handler 与站点
 * HTML handler（OGP 注入）共用；浏览者视角由调用方给，爬虫固定 `null`。
 */
export async function loadQuickExchangeModel(
    c: Context<AppEnvironment>,
    repository: NamecardRepository,
    handle: string,
    viewerId: string | null,
): Promise<QuickExchangeModelResult> {
    const target = await repository.findExchangeTarget(handle);
    if (!target) {
        return { ok: false, error: '找不到这位制作人' };
    }
    const cards = target.cards.length
        ? await repository.listQuickExchangeCards(target.profile.account_id)
        : [];
    const targetMissingCount =
        viewerId && viewerId !== target.profile.account_id
            ? await repository.countMissingCollectionCards({
                  cardOwnerId: viewerId,
                  otherAccountId: target.profile.account_id,
              })
            : 0;
    // 一次批量查完清单里所有卡，再逐卡合并；未命中的卡省略字段而不是写 `false`。
    const collected =
        viewerId && viewerId !== target.profile.account_id && cards.length > 0
            ? await repository.listCollectedCardNumbers({
                  collectorAccountId: viewerId,
                  cardNumbers: cards.map((card) => Number(card.card_number)),
              })
            : null;
    return {
        ok: true,
        model: {
            handle,
            accountId: target.profile.account_id,
            uid: target.profile.uid,
            displayName: target.profile.display_name,
            cards: await Promise.all(
                cards.map(async (card) => {
                    const response = await resolveExchangeCardMedia(
                        c,
                        toPublicNamecardResponse(card, viewerId),
                    );
                    return collected?.has(Number(card.card_number))
                        ? { ...response, collected: true }
                        : response;
                }),
            ),
            targetMissingCount,
        },
    };
}

/** 快速交换页：对方勾选过的、此刻仍然可交换的名片。 */
export async function handleGetQuickExchange(
    c: NamecardQuickContext,
): Promise<Response> {
    const { handle } = c.req.valid('param');
    const result = await loadQuickExchangeModel(
        c,
        namecardRepository(c),
        handle,
        c.get('platformUser')?.id ?? null,
    );
    if (!result.ok) {
        return c.json({ error: result.error } satisfies NamecardErrorResponse, 404);
    }
    return c.json(result.model satisfies NamecardQuickExchangeResponse);
}
