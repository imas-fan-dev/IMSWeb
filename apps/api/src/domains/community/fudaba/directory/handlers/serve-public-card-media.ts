import type { AppEnvironment } from '@/app';
import { NAMECARD_MEDIA_NOT_FOUND } from '@/domains/community/namecards/response';
import { fudabaRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { isCardPageObjectKey } from '@/utils/storage/business-object-keys';
import { respondCardMedia } from '@/domains/community/fudaba/cards/card-media-response';

/**
 * Public exchange-wall media, addressed by the card UUID. Reads the same page
 * rows and delivery policy as `/api/cards/:number/media/:pageId`; the UUID
 * route exists because exchange payloads already carry the UUID.
 */
export async function handleServeExchangeCardMedia(
    c: ValidatedRequestContext<
        AppEnvironment,
        'param' | 'query',
        { cardId: string; side: string } & {
            w?: '160' | '400' | '800' | '1400' | undefined;
        }
    >
): Promise<Response> {
    const { cardId, side } = c.req.valid('param');
    const { w } = c.req.valid('query');
    const key = await fudabaRepository(c).findPublishedCardPageKeyById(
        cardId,
        side
    );
    if (!key) return c.text(NAMECARD_MEDIA_NOT_FOUND, 404);
    return respondCardMedia(c, {
        key,
        width: w,
        cacheControl: 'public, max-age=300',
        sizedCacheControl: isCardPageObjectKey(key)
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=300',
        notFound: NAMECARD_MEDIA_NOT_FOUND
    });
}
