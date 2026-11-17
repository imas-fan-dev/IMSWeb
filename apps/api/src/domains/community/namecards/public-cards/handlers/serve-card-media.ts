import type { AppEnvironment } from '@/app';
import { NAMECARD_MEDIA_NOT_FOUND } from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { isCardPageObjectKey } from '@/utils/storage/business-object-keys';
import { respondCardMedia } from '@/domains/community/fudaba/cards/card-media-response';
import { resolvePublicCardMediaKey } from '@/domains/community/fudaba/cards/card-media-resolver';

/**
 * Serves one page of a published card's artwork. Middle pages are stored under
 * the editor's object layout, which has no reversible public path, so the wall
 * addresses them by card number instead.
 */
export async function handleServePublicCardMedia(
    c: ValidatedRequestContext<
        AppEnvironment,
        'param' | 'query',
        { id: number; side: string } & {
            w?: '160' | '400' | '800' | '1400' | undefined;
        }
    >
): Promise<Response> {
    const { id, side } = c.req.valid('param');
    const { w } = c.req.valid('query');
    const key = await resolvePublicCardMediaKey(
        namecardRepository(c),
        id,
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
