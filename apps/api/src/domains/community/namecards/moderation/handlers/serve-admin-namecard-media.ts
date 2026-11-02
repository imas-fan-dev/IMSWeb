import type { AppEnvironment } from '@/app';
import { NAMECARD_MEDIA_NOT_FOUND } from '@/domains/community/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { objectReadResponse } from '@/utils/http/object-read-response';

/**
 * Serves the artwork a moderator is comparing. `draft=1` prefers the submitted
 * revision, falling back to the live object when the submission reused it.
 * Live artwork of a card awaiting its first review is not public yet, which is
 * why this cannot reuse the public card media route.
 */
export async function handleServeAdminNamecardMedia(
    c: ValidatedRequestContext<
        AppEnvironment,
        'param',
        { id: number; side: string; variant: 'live' | 'draft' }
    >
): Promise<Response> {
    const { id, side, variant } = c.req.valid('param');
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const key = await namecardRepository(c).findCardMediaKey(
        id,
        side,
        variant === 'draft'
    );
    if (!key) return c.text(NAMECARD_MEDIA_NOT_FOUND, 404);
    const response = await objectReadResponse(c.req.raw, storage, key, {
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie'
    });
    return response ?? c.text(NAMECARD_MEDIA_NOT_FOUND, 404);
}
