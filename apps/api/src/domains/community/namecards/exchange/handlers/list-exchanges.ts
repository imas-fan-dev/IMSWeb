import type { NamecardExchangeHistoryEntry } from '@imsweb/contracts/namecards';
import type { NamecardCollectionQueryContext } from '@/domains/community/namecards/exchange/request';
import type { NamecardExchangeHistoryPageResponse } from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';

/** 交换记录：发起与收到都算自己的一条。 */
export async function handleListExchanges(
    c: NamecardCollectionQueryContext,
): Promise<Response> {
    const query = c.req.valid('query');
    const page = query.page ?? 1;
    const size = query.size ?? 24;
    const accountId = c.get('platformUser')!.id;
    const repository = namecardRepository(c);
    const { rows, total } = await repository.listExchanges({
        accountId,
        limit: size,
        offset: (page - 1) * size,
    });
    const counterparts = new Map<
        string,
        { accountId: string; uid: number; pageSlug: string | null; displayName: string }
    >();
    for (const row of rows) {
        const otherId =
            row.initiator_account_id === accountId
                ? row.target_account_id
                : row.initiator_account_id;
        if (counterparts.has(otherId)) continue;
        const profile = await repository.findPublicProfile(otherId);
        counterparts.set(otherId, {
            accountId: otherId,
            uid: profile?.uid ?? 0,
            pageSlug: profile?.page_slug ?? null,
            displayName: profile?.display_name ?? '一位制作人',
        });
    }
    return c.json({
        list: rows.map((row) => {
            const outgoing = row.initiator_account_id === accountId;
            const entry: NamecardExchangeHistoryEntry = {
                id: row.id,
                source: row.source,
                status: row.status,
                direction: outgoing ? 'outgoing' : 'incoming',
                counterpart: counterparts.get(
                    outgoing ? row.target_account_id : row.initiator_account_id,
                )!,
                targetCardNumbers: row.target_card_numbers,
                initiatorCardNumbers: row.initiator_card_numbers,
                createdAt: new Date(row.created_at).toISOString(),
                resolvedAt: row.resolved_at
                    ? new Date(row.resolved_at).toISOString()
                    : null,
            };
            return entry;
        }),
        total,
        totalPage: Math.max(1, Math.ceil(total / size)),
    } satisfies NamecardExchangeHistoryPageResponse);
}
