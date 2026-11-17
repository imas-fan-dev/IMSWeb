import type { AppEnvironment } from '@/app';
import { NAMECARD_MEDIA_NOT_FOUND } from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { respondCardMedia } from '@/domains/community/fudaba/cards/card-media-response';
import { resolveAdminCardMediaKey } from '@/domains/community/fudaba/cards/card-media-resolver';

/**
 * Serves the artwork a moderator is comparing. `draft=1` prefers the submitted
 * revision, falling back to the live object when the submission reused it.
 * Live artwork of a card awaiting its first review is not public yet, which is
 * why this cannot reuse the public card media route.
 */
export async function handleServeAdminNamecardMedia(
    c: ValidatedRequestContext<
        AppEnvironment,
        'param' | 'query',
        { id: number; side: string; variant: 'live' | 'draft' } & {
            w?: '160' | '400' | '800' | '1400' | undefined;
        }
    >
): Promise<Response> {
    const { id, side, variant } = c.req.valid('param');
    const { w } = c.req.valid('query');
    const key = await resolveAdminCardMediaKey(
        namecardRepository(c),
        id,
        side,
        variant === 'draft'
    );
    if (!key) return c.text(NAMECARD_MEDIA_NOT_FOUND, 404);
    return respondCardMedia(c, {
        key,
        width: w,
        cacheControl: 'private, no-store',
        vary: 'Cookie',
        notFound: NAMECARD_MEDIA_NOT_FOUND
    });
}
