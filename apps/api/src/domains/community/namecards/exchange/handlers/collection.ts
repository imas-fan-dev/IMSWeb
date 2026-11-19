import type {
    NamecardCollectionEntry,
} from '@imsweb/contracts/namecards';
import type {
    NamecardCollectionEntryContext,
    NamecardCollectionQueryContext,
} from '@/domains/community/namecards/exchange/request';
import type {
    NamecardCollectionPageResponse,
    NamecardCollectionVisibilityResponse,
    NamecardErrorResponse,
} from '@/domains/community/namecards/response';
import { toPublicNamecardResponse } from '@/domains/community/namecards/response';
import { resolveExchangeCardMedia } from '@/domains/community/namecards/exchange/media';
import { namecardRepository } from '@/middleware/hono-context';

/** 名片册：原卡行还在就给最新投影（含持有者已下线的 `hidden`），行没了才只剩交换当时留下的快照。 */
export async function handleListCollection(
    c: NamecardCollectionQueryContext,
): Promise<Response> {
    const query = c.req.valid('query');
    const page = query.page;
    const size = query.size;
    const accountId = c.get('platformUser')!.id;
    const { rows, total } = await namecardRepository(c).listCollection({
        accountId,
        limit: size,
        offset: (page - 1) * size,
        sort: query.sort,
        ...(query.dir ? { dir: query.dir } : {}),
        ...(query.q ? { q: query.q } : {}),
        ...(query.owner ? { owner: query.owner } : {}),
        ...(query.series.length > 0 ? { seriesCodes: query.series } : {}),
        ...(query.group ? { groupName: query.group } : {}),
        ...(query.character.length > 0 ? { characterIds: query.character } : {}),
        match: query.match,
        excludeOther: query.excludeOther,
        excludeCross: query.excludeCross,
        ...(query.declaration ? { declaration: query.declaration } : {}),
        invert: query.invert,
        includeOwn: query.includeOwn,
        includeHidden: query.includeHidden,
    });
    const list = await Promise.all(
        rows.map(async (row) => {
            const entry: NamecardCollectionEntry = {
                cardNumber: row.card_number,
                obtainedAt: new Date(row.obtained_at).toISOString(),
                hiddenAt: row.hidden_at ? new Date(row.hidden_at).toISOString() : null,
                own: row.own,
                owner: row.owner
                    ? {
                          accountId: row.owner.account_id,
                          uid: row.owner.uid,
                          displayName: row.owner.display_name,
                      }
                    : null,
                // 「在线」只表示原卡仍对外可见；`hidden` 的条目照样带 `card`（图照常显示），
                // 前端据 `!available && card` 标「对方已删除」（doc §5）。
                available: row.card_status === 'published',
                card: row.card
                    ? await resolveExchangeCardMedia(
                          c,
                          toPublicNamecardResponse(row.card, accountId),
                      )
                    : null,
                snapshot: row.snapshot,
            };
            return entry;
        }),
    );
    return c.json({
        list,
        total,
        totalPage: Math.max(1, Math.ceil(total / size)),
    } satisfies NamecardCollectionPageResponse);
}

/** 只切换显示状态；名片本身仍在册，随时可以恢复。 */
export async function handleSetCollectionVisibility(
    c: NamecardCollectionEntryContext,
): Promise<Response> {
    const { cardNumber } = c.req.valid('param');
    const { hidden } = c.req.valid('json');
    const updated = await namecardRepository(c).setCollectionHidden({
        accountId: c.get('platformUser')!.id,
        cardNumber: Number(cardNumber),
        hidden,
        at: new Date().toISOString(),
    });
    if (!updated) {
        return c.json({ error: '名片册里没有这张名片' } satisfies NamecardErrorResponse, 404);
    }
    return c.json({ success: true } satisfies NamecardCollectionVisibilityResponse);
}
