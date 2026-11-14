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

/** 名片册：原卡还在就给最新投影，删掉了就只剩交换当时留下的快照。 */
export async function handleListCollection(
    c: NamecardCollectionQueryContext,
): Promise<Response> {
    const query = c.req.valid('query');
    const page = query.page ?? 1;
    const size = query.size ?? 24;
    const accountId = c.get('platformUser')!.id;
    const { rows, total } = await namecardRepository(c).listCollection({
        accountId,
        limit: size,
        offset: (page - 1) * size,
    });
    const list = await Promise.all(
        rows.map(async (row) => {
            const entry: NamecardCollectionEntry = {
                cardNumber: row.card_number,
                obtainedAt: new Date(row.obtained_at).toISOString(),
                hiddenAt: row.hidden_at ? new Date(row.hidden_at).toISOString() : null,
                available: row.card !== null,
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
