import type { AppEnvironment } from "@/app";
import { cardArtworkView } from "@/domains/community/fudaba/cards/artwork-view";
import { parseNamecardPage } from "@/domains/community/namecards/request";
import {
    toPublicNamecardResponse,
    type NamecardPageResponse,
} from "@/domains/community/namecards/response";
import { services } from "@/middleware/hono-context";
import type { ValidatedRequestContext } from "@/middleware/request-validation";

/**
 * 用户主页下半部分：这个人自己持有的、已发布且允许展示的名片。
 * 排序与管理界面一致（按名片编号倒序），后续再支持自定义顺序与分组。
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
    const total = await repository.countOwnedPublishedCards(accountId);
    const rows = await repository.listOwnedPublishedCards(
        accountId,
        size,
        (page - 1) * size,
    );
    const pagesByNumber =
        (await services(c).fudaba?.listCardPagesBatchByNumbers?.(
            rows.map((card) => Number(card.card_number))
        )) ?? new Map();
    const list = rows.map((card) => {
        const pageRows = pagesByNumber.get(Number(card.card_number));
        const pages = cardArtworkView({
            scope: 'public',
            publicRoute: 'cards',
            cardNumber: Number(card.card_number),
            cardId: String(card.cardId ?? card.card_number),
            live: pageRows?.live ?? [],
            pending: []
        }).live;
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
    } satisfies NamecardPageResponse);
}
