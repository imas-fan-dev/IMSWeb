import type { AppEnvironment } from '@/app';
import { resolveNamecardThumbnailUrl } from '@/domains/namecards/media-assets';
import type { NamecardListQuery } from '@/domains/namecards/request';
import {
    toPublicNamecardResponse,
    type NamecardListErrorResponse,
    type NamecardPageResponse
} from '@/domains/namecards/response';
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
            return toPublicNamecardResponse({
                ...card,
                claim_status: status?.claim_status,
                viewer_claim_state: status?.viewer_claim_state
            });
        });
        const storage = services(c).storage;
        return c.json({
            list: storage
                ? await Promise.all(cards.map(async (card) => {
                    const [image1Url, image2Url] = await Promise.all([
                        resolvePublicMediaUrl(storage, card.image1_url),
                        resolvePublicMediaUrl(storage, card.image2_url)
                    ]);
                    const [image1ThumbnailUrl, image2ThumbnailUrl] = await Promise.all([
                        resolveNamecardThumbnailUrl(storage, card.image1_url, image1Url),
                        resolveNamecardThumbnailUrl(storage, card.image2_url, image2Url)
                    ]);
                    return {
                        ...card,
                        image1_url: image1Url,
                        image2_url: image2Url,
                        image1_thumbnail_url: image1ThumbnailUrl,
                        image2_thumbnail_url: image2ThumbnailUrl
                    };
                }))
                : cards,
            total,
            totalPage: Math.ceil(total / size)
        } satisfies NamecardPageResponse);
    } catch {
        return c.json({ msg: '查询失败' } satisfies NamecardListErrorResponse);
    }
}
