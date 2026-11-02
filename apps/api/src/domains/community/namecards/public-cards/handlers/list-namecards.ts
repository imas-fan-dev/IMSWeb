import type { AppEnvironment } from '@/app';
import { resolveNamecardThumbnailUrl } from '@/domains/community/fudaba/card-media-assets';
import type { NamecardListQuery } from '@/domains/community/namecards/request';
import {
    toPublicNamecardResponse,
    type NamecardListErrorResponse,
    type NamecardPageResponse
} from '@/domains/community/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { resolvePublicMediaUrl } from '@/utils/storage/public-object-url';

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
                rows.map((card) => Number(card.id)),
                c.get('platformUser')?.id ?? null
            )
            : [];
        const statusByCardId = new Map(statuses.map((status) => [
            status.legacy_card_id,
            status
        ]));
        const cards = rows.map((card) => {
            const status = statusByCardId.get(Number(card.id));
            return toPublicNamecardResponse(
                {
                    ...card,
                    claim_status: status?.claim_status,
                    viewer_claim_state: status?.viewer_claim_state,
                    claimer_name: status?.claimer_name
                },
                c.get('platformUser')?.id ?? null
            );
        });
        const storage = services(c).storage;
        return c.json({
            list: storage
                ? await Promise.all(cards.map(async (card) => {
                    const image1Url = await resolvePublicMediaUrl(
                        storage,
                        card.image1_url
                    );
                    const image2Url =
                        card.image2_url === null
                            ? null
                            : await resolvePublicMediaUrl(storage, card.image2_url);
                    const image1ThumbnailUrl = await resolveNamecardThumbnailUrl(
                        storage,
                        card.image1_url,
                        image1Url
                    );
                    const image2ThumbnailUrl =
                        image2Url === null
                            ? null
                            : await resolveNamecardThumbnailUrl(
                                  storage,
                                  card.image2_url as string,
                                  image2Url
                              );
                    const middleImageUrls = await Promise.all(
                        card.middleImageUrls.map((url) =>
                            resolvePublicMediaUrl(storage, url)
                        )
                    );
                    return {
                        ...card,
                        image1_url: image1Url,
                        image2_url: image2Url,
                        image1_thumbnail_url: image1ThumbnailUrl,
                        image2_thumbnail_url: image2ThumbnailUrl,
                        middleImageUrls
                    };
                }))
                : cards,
            total,
            totalPage: Math.ceil(total / size)
        } satisfies NamecardPageResponse);
    } catch (error) {
        console.error('Failed to list namecards', error);
        return c.json({ msg: '查询失败' } satisfies NamecardListErrorResponse);
    }
}
