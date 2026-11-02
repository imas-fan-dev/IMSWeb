import type { AppEnvironment } from '@/app';
import { NAMECARD_MEDIA_NOT_FOUND } from '@/domains/community/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { objectReadResponse } from '@/utils/http/object-read-response';

/**
 * Serves one page of a published card's artwork. Middle pages are stored under
 * the editor's object layout, which has no reversible public path, so the wall
 * addresses them by card number instead.
 */
export async function handleServePublicCardMedia(
    c: ValidatedRequestContext<AppEnvironment, 'param', { id: number; side: string }>
): Promise<Response> {
    const { id, side } = c.req.valid('param');
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const key = await namecardRepository(c).findPublishedCardMediaKey(id, side);
    if (!key) return c.text(NAMECARD_MEDIA_NOT_FOUND, 404);
    const response = await objectReadResponse(
        c.req.raw,
        storage,
        key,
        { 'Cache-Control': 'public, max-age=300' },
        { mode: 'redirect' }
    );
    return response ?? c.text(NAMECARD_MEDIA_NOT_FOUND, 404);
}
