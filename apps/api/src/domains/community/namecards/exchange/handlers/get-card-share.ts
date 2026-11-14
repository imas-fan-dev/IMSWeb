import type { NamecardShareContext } from '@/domains/community/namecards/exchange/request';
import type {
    NamecardCardShareResponse,
    NamecardErrorResponse,
} from '@/domains/community/namecards/response';
import { toPublicNamecardResponse } from '@/domains/community/namecards/response';
import { resolveExchangeCardMedia } from '@/domains/community/namecards/exchange/media';
import { namecardRepository } from '@/middleware/hono-context';

/**
 * 单卡分享页。卡片已下架、被锁定或还没认领都只回 404：分享链接不替持有者
 * 解释原因，页面上只显示一句「这张名片当前不开放交换」。
 */
export async function handleGetCardShare(
    c: NamecardShareContext,
): Promise<Response> {
    const { slug } = c.req.valid('param');
    const repository = namecardRepository(c);
    const card = await repository.findCardByExchangeSlug(slug);
    if (!card || !card.owner_account_id) {
        return c.json(
            { error: '这张名片当前不开放交换' } satisfies NamecardErrorResponse,
            404,
        );
    }
    const viewerId = c.get('platformUser')?.id ?? null;
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
    return c.json({
        state,
        card: await resolveExchangeCardMedia(
            c,
            toPublicNamecardResponse(card, viewerId),
        ),
        owner: {
            accountId: card.owner_account_id,
            uid: owner?.uid ?? 0,
            pageSlug: owner?.page_slug ?? null,
            displayName: owner?.display_name ?? '一位制作人',
        },
        targetMissingCount,
    } satisfies NamecardCardShareResponse);
}
