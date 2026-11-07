import type { AppEnvironment } from '@/app';
import type { CompatibleNamecardIdParams } from '@/domains/community/namecards/request';
import type { PublicNamecardResponse as PublicCardResponse } from '@imsweb/contracts/namecards';
import { toPublicNamecardResponse } from '@/domains/community/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { resolvePublicMediaUrl } from '@/utils/storage/public-object-url';

/**
 * 名片墙的分页拿不到当前页以外的名片，而站内信与「随机补充一张」都会用
 * `?card=<编号>` 深链到任意一张。这里按编号单独取一次，返回与列表相同的投影，
 * 详情窗因此可以直接打开不在本页的卡。
 */
export async function handleGetPublicCard(
    c: ValidatedRequestContext<AppEnvironment, 'param', CompatibleNamecardIdParams>
): Promise<Response> {
    const { id } = c.req.valid('param');
    const repository = namecardRepository(c);
    const viewerId = c.get('platformUser')?.id ?? null;
    const card = await repository.findApprovedCard(id);
    if (!card) return c.json({ card: null } satisfies PublicCardResponse);

    const [status] = (await services(c).fudaba?.listLegacyNamecardClaimStatuses(
        [id],
        viewerId
    )) ?? [];
    const response = toPublicNamecardResponse(
        {
            ...card,
            claim_status: status?.claim_status,
            viewer_claim_state: status?.viewer_claim_state,
            claimer_name: status?.claimer_name,
            claimer_account_id: status?.claimer_account_id,
            claimer_uid: status?.claimer_uid,
            supplement_pending: status?.supplement_pending ?? false
        },
        viewerId
    );

    const storage = services(c).storage;
    if (!storage) return c.json({ card: response } satisfies PublicCardResponse);
    const image1Url = await resolvePublicMediaUrl(storage, response.image1_url);
    const image2Url =
        response.image2_url == null
            ? null
            : await resolvePublicMediaUrl(storage, response.image2_url);
    return c.json({
        card: {
            ...response,
            image1_url: image1Url,
            image2_url: image2Url,
            image1_thumbnail_url: image1Url,
            image2_thumbnail_url: image2Url,
            middleImageUrls: await Promise.all(
                response.middleImageUrls.map((url) =>
                    resolvePublicMediaUrl(storage, url)
                )
            )
        }
    } satisfies PublicCardResponse);
}
