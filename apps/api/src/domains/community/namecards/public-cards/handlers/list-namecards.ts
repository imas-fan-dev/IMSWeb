import type { AppEnvironment } from '@/app';
import type { NamecardListQuery } from '@/domains/community/namecards/request';
import { cardArtworkView } from '@/domains/community/fudaba/cards/artwork-view';
import {
    toPublicNamecardResponse,
    type NamecardListErrorResponse,
    type NamecardPageResponse
} from '@/domains/community/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleListNamecards(
    c: ValidatedRequestContext<AppEnvironment, 'query', NamecardListQuery>
): Promise<Response> {
    const { page, size } = c.req.valid('query');
    try {
        const total = await namecardRepository(c).countApprovedCards();
        const rows = await namecardRepository(c).listApprovedCards(
            size,
            (page - 1) * size
        );
        const claimRepository = services(c).fudaba;
        const statuses = claimRepository
            ? await claimRepository.listLegacyNamecardClaimStatuses(
                rows.map((card) => Number(card.card_number ?? card.id)),
                c.get('platformUser')?.id ?? null
            )
            : [];
        const statusByCardId = new Map(statuses.map((status) => [
            status.legacy_card_id,
            status
        ]));
        // 统一布局的页面行：一次批量查询，缺批量方法时按无页面处理。
        const pagesByNumber =
            (await services(c).fudaba?.listCardPagesBatchByNumbers?.(
                rows.map((card) => Number(card.id))
            )) ?? new Map();
        const cards = rows.map((card) => {
            const status = statusByCardId.get(Number(card.id));
            const pageRows = pagesByNumber.get(Number(card.id));
            const pages = cardArtworkView({
                scope: 'public',
                publicRoute: 'cards',
                cardNumber: Number(card.id),
                cardId: String(card.cardId ?? card.id),
                live: pageRows?.live ?? [],
                pending: []
            }).live;
            return toPublicNamecardResponse(
                {
                    ...card,
                    claim_status: status?.claim_status,
                    viewer_claim_state: status?.viewer_claim_state,
                    claimer_name: status?.claimer_name,
                    claimer_account_id: status?.claimer_account_id,
                    claimer_uid: status?.claimer_uid,
                    supplement_pending: status?.supplement_pending ?? false
                },
                c.get('platformUser')?.id ?? null,
                pages
            );
        });
        return c.json({
            list: cards,
            total,
            totalPage: Math.ceil(total / size)
        } satisfies NamecardPageResponse);
    } catch (error) {
        console.error('Failed to list namecards', error);
        return c.json({ msg: '查询失败' } satisfies NamecardListErrorResponse);
    }
}
