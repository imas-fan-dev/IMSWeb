import type { AppEnvironment } from '@/app';
import { NAMECARD_MEDIA_NOT_FOUND } from '@/domains/community/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import { objectReadResponse } from '@/utils/http/object-read-response';
import { fudabaCardMediaThumbnailKey } from '@/utils/storage/business-object-keys';

/**
 * Serves one page of a published card's artwork. Middle pages are stored under
 * the editor's object layout, which has no reversible public path, so the wall
 * addresses them by card number instead.
 */
/** Falls back to the original whenever the small copy was never written. */
export async function preferThumbnail(
    storage: { exists(key: string): Promise<boolean> },
    key: string
): Promise<string> {
    const thumbnailKey = fudabaCardMediaThumbnailKey(key);
    if (thumbnailKey === key) return key;
    try {
        return (await storage.exists(thumbnailKey)) ? thumbnailKey : key;
    } catch {
        return key;
    }
}

export async function handleServePublicCardMedia(
    c: ValidatedRequestContext<
        AppEnvironment,
        'param' | 'query',
        { id: number; side: string } & { thumb?: '1' | undefined }
    >
): Promise<Response> {
    const { id, side } = c.req.valid('param');
    const { thumb } = c.req.valid('query');
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const key = await namecardRepository(c).findPublishedCardMediaKey(id, side);
    if (!key) return c.text(NAMECARD_MEDIA_NOT_FOUND, 404);
    const served = thumb === '1' ? await preferThumbnail(storage, key) : key;
    const response = await objectReadResponse(
        c.req.raw,
        storage,
        served,
        { 'Cache-Control': 'public, max-age=300' },
        { mode: 'redirect' }
    );
    return response ?? c.text(NAMECARD_MEDIA_NOT_FOUND, 404);
}
