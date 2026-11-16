import type { AppEnvironment } from "@/app";
import { namecardPagesView } from "@/domains/community/fudaba/cards/artwork-view";
import {
    flattenCardLayout,
    normalizeCardLayout,
} from "@/domains/community/namecards/exchange/layout";
import { parseNamecardPage } from "@/domains/community/namecards/request";
import {
    toPublicNamecardResponse,
    type NamecardPageResponse,
} from "@/domains/community/namecards/response";
import { services } from "@/middleware/hono-context";
import type { ValidatedRequestContext } from "@/middleware/request-validation";

/**
 * 用户主页下半部分：这个人自己持有的、已发布且允许展示的名片。
 *
 * 顺序与分组来自属主的清单布局（doc §5；任务 design-owner-card-manager §4.3）：
 * 没有布局、或布局里没有某张卡时，回到「按名片编号倒序」的旧行为。
 */
export async function handleListProfileCards(
    c: ValidatedRequestContext<
        AppEnvironment,
        "param",
        { accountId: string }
    >,
): Promise<Response> {
    const { accountId: handle } = c.req.valid("param");
    const { page, size } = parseNamecardPage(c.req.url);
    const repository = services(c).namecards;
    if (!repository) {
        return c.json({ list: [], total: 0, totalPage: 0 } satisfies NamecardPageResponse);
    }
    // The path segment may be a uid or a vanity slug, so the wall card query
    // needs the account id it resolves to.
    const profile = await repository.findPublicProfile(handle);
    if (!profile) {
        return c.json(
            { list: [], total: 0, totalPage: 0 } satisfies NamecardPageResponse,
            404,
        );
    }
    const accountId = profile.account_id;
    // 一个账号的名片量级很小，按布局排序后在内存里分页，避免为自定义顺序另写一套 SQL。
    const cards = await repository.listOwnedPublishedCardsAll(accountId);
    const normalized = normalizeCardLayout(
        await repository.getCardLayout(accountId),
        cards.map((card) => Number(card.card_number)),
    );
    const order = new Map(
        flattenCardLayout(normalized).map((number, index) => [number, index]),
    );
    const ordered = [...cards].sort(
        (left, right) =>
            (order.get(Number(left.card_number)) ?? 0) -
            (order.get(Number(right.card_number)) ?? 0),
    );
    const total = ordered.length;
    const rows = ordered.slice((page - 1) * size, page * size);
    const pagesByNumber =
        (await services(c).fudaba?.listCardPagesBatchByNumbers?.(
            rows.map((card) => Number(card.card_number))
        )) ?? new Map();
    const list = rows.map((card) => {
        const pages = namecardPagesView(
            pagesByNumber.get(Number(card.card_number)),
            {
                scope: "public",
                publicRoute: "cards",
                cardNumber: Number(card.card_number),
                cardId: String(card.cardId ?? card.card_number),
            },
        ).live;
        return toPublicNamecardResponse(
            card,
            c.get("platformUser")?.id ?? null,
            pages,
        );
    });
    return c.json({
        list,
        total,
        totalPage: size > 0 ? Math.ceil(total / size) : 0,
        ...(normalized.groups.length > 0
            ? {
                  groups: normalized.groups.map((group) => ({
                      title: group.title,
                      cardNumbers: group.cardNumbers,
                  })),
              }
            : {}),
    } satisfies NamecardPageResponse);
}
