import type { AppEnvironment } from '@/app';
import type { CompatibleNamecardIdParams } from '@/domains/namecards/request';
import type {
    NamecardDetailResponse,
    NamecardEmptyResponse
} from '@/domains/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { resolvePublicMediaUrl } from '@/utils/storage/public-object-url';

export async function handleGetNamecard(
    c: ValidatedRequestContext<AppEnvironment, 'param', CompatibleNamecardIdParams>
): Promise<Response> {
    const { id } = c.req.valid('param');
    if (!id) return c.json({} satisfies NamecardEmptyResponse);
    try {
        const card = await namecardRepository(c).findApprovedCardMedia(id);
        if (!card) return c.json({} satisfies NamecardEmptyResponse);
        const media = { image1_url: card.image1_url, image2_url: card.image2_url };
        const storage = services(c).storage;
        return c.json((storage
            ? {
                image1_url: await resolvePublicMediaUrl(storage, media.image1_url),
                image2_url: await resolvePublicMediaUrl(storage, media.image2_url)
            }
            : media) satisfies NamecardDetailResponse);
    } catch {
        return c.json({} satisfies NamecardEmptyResponse);
    }
}
