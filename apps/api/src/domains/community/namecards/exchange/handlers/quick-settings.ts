import type { NamecardQuickSettings } from '@imsweb/contracts/namecards';
import { NAMECARD_EXCHANGE_CARD_LIMIT } from '@imsweb/contracts/namecards/runtime';
import type {
    NamecardQuickSelectionContext,
    NamecardQuickSettingsContext,
} from '@/domains/community/namecards/exchange/request';
import type {
    NamecardErrorResponse,
    NamecardQuickSettingsResponse,
} from '@/domains/community/namecards/response';
import { toPublicNamecardResponse } from '@/domains/community/namecards/response';
import { resolveExchangeCardMedia } from '@/domains/community/namecards/exchange/media';
import { namecardRepository } from '@/middleware/hono-context';
import type { AppEnvironment } from '@/app';
import type { Context } from 'hono';

/**
 * 候选的共享读取：`cards` 永远是我自己的候选（含 `manual` / `none`），`selected`
 * 来自快速清单。`targetAccountId` 只叠加「对方视角」的两个字段：逐卡的
 * `targetOwns`（对方名片册里已有）与顶层 `targetMissingCount`（我有、对方还没有）。
 *
 * 没有目标时（PUT 回读、GET 没带 `target`、或目标就是自己）两个字段整份省略，
 * 而不是写死 `false` / `0` —— 与分享页的 `collected` 同一口径。
 */
async function quickSettings(
    c: Context<AppEnvironment>,
    targetAccountId?: string,
): Promise<NamecardQuickSettings> {
    const accountId = c.get('platformUser')!.id;
    const repository = namecardRepository(c);
    const [candidates, selected] = await Promise.all([
        repository.listExchangeCandidates(accountId),
        repository.listQuickExchangeCards(accountId),
    ]);
    const picked = new Set(selected.map((card) => card.card_number ?? card.id));
    const cardNumbers = candidates.map((card) => card.card_number ?? card.id);
    // 「对方已收下」与交换写路径的 `already-owned` 同口径（不看 `hidden_at`）；
    // 一次批量查完全部候选，再逐卡合并。
    const targetView = targetAccountId
        ? {
              owns: await repository.listCollectedCardNumbers({
                  collectorAccountId: targetAccountId,
                  cardNumbers,
              }),
              missingCount: await repository.countMissingCollectionCards({
                  cardOwnerId: accountId,
                  otherAccountId: targetAccountId,
              }),
          }
        : null;
    const cards = await Promise.all(
        candidates.map(async (card) => {
            const cardNumber = card.card_number ?? card.id;
            const resolved = await resolveExchangeCardMedia(
                c,
                toPublicNamecardResponse(card, accountId),
            );
            return {
                cardNumber,
                pages: resolved.pages ?? [],
                exchangeMode:
                    card.exchange_mode === 'auto' ||
                    card.exchange_mode === 'manual'
                        ? card.exchange_mode
                        : ('none' as const),
                selected: picked.has(cardNumber),
                ...(targetView?.owns.has(cardNumber) ? { targetOwns: true as const } : {}),
            };
        }),
    );
    return {
        // 上限与提交侧的 `max()` 共用同一个常量：选卡窗口的 X/20 与后端校验不能各写一份。
        limit: NAMECARD_EXCHANGE_CARD_LIMIT,
        cards,
        ...(targetView ? { targetMissingCount: targetView.missingCount } : {}),
    };
}

/**
 * 目标账号的两种来源：`target`（uid / slug / 账号 ID）与 `targetCard`（公开卡号）。
 *
 * 名片墙与用户主页的公开卡投影里 `claimerUid` 恒为 null（属主卡走新属主流，没有
 * 认领字段），只有卡号可靠，所以这两条入口用 `targetCard` 反查卡主账号。
 * `null` = 认不出人（调用方回 404），`'conflict'` = 两个参数同时给出。
 */
async function resolveTargetAccountId(
    c: NamecardQuickSettingsContext,
    query: { target?: string; targetCard?: string },
): Promise<string | null | 'conflict'> {
    const { target, targetCard } = query;
    if (target && targetCard) return 'conflict';
    if (!target && !targetCard) return null;
    const repository = namecardRepository(c);
    if (targetCard) {
        const card = await repository.findApprovedCard(Number(targetCard));
        // 未认领的卡没有可交换的账号；与 handle 认不出人同文案、同状态码。
        return card?.owner_account_id ?? null;
    }
    if (target) {
        const found = await repository.findExchangeTarget(target);
        return found?.profile.account_id ?? null;
    }
    return null;
}

/**
 * 我自己勾选的快速交换清单；带 `target` / `targetCard` 时顺带给出目标视角，供选卡
 * 窗口复用同一份候选（不必再为「对方已有哪几张」开第二个端点）。两个参数互斥。
 */
export async function handleGetQuickSettings(
    c: NamecardQuickSettingsContext,
): Promise<Response> {
    const query = c.req.valid('query');
    const resolved = await resolveTargetAccountId(c, query);
    if (resolved === 'conflict') {
        // 两个目标参数同时出现时无法判定以谁为准：拒绝，而不是悄悄挑一个。
        return c.json({ error: '目标用户标识无效' } satisfies NamecardErrorResponse, 400);
    }
    if (query.target || query.targetCard) {
        if (!resolved) {
            // 与快速交换页同文案、同状态码：认不出人就是 404。
            return c.json({ error: '找不到这位制作人' } satisfies NamecardErrorResponse, 404);
        }
    }
    const viewerId = c.get('platformUser')!.id;
    // 目标就是自己时当「没传」处理：候选全是自己的卡，`targetOwns` 必然张张命中、
    // 缺卡数必然是 0，两个字段都没有信息量，省略比写死更接近「没有目标」。
    const targetAccountId =
        resolved === null || resolved === viewerId ? undefined : resolved;
    return c.json((await quickSettings(c, targetAccountId)) satisfies NamecardQuickSettingsResponse);
}

/** 整份覆盖：一次保存就是一次完整的勾选结果。 */
export async function handlePutQuickSettings(
    c: NamecardQuickSelectionContext,
): Promise<Response> {
    const { cardNumbers } = c.req.valid('json');
    await namecardRepository(c).replaceQuickExchangeCards({
        accountId: c.get('platformUser')!.id,
        cardNumbers,
    });
    return c.json((await quickSettings(c)) satisfies NamecardQuickSettingsResponse);
}
