import type { AppEnvironment } from '@/app';
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
        const cards = (await namecardRepository(c).listApprovedCards(size, (page - 1) * size))
            .map(toPublicNamecardResponse);
        const storage = services(c).storage;
        return c.json({
            list: storage
                ? await Promise.all(cards.map(async (card) => ({
                    ...card,
                    image1_url: await resolvePublicMediaUrl(storage, card.image1_url),
                    image2_url: await resolvePublicMediaUrl(storage, card.image2_url)
                })))
                : cards,
            total,
            totalPage: Math.ceil(total / size)
        } satisfies NamecardPageResponse);
    } catch {
        return c.json({ msg: '查询失败' } satisfies NamecardListErrorResponse);
    }
}
