import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { publicUploadKey } from '@/domains/media/media-access';
import { objectReadResponse } from '@/utils/http/object-read-response';
import { services } from '@/middleware/hono-context';

export async function handleServePublicUpload(c: Context<AppEnvironment>): Promise<Response> {
    const runtime = services(c);
    if (!runtime.storage) throw new Error('Object storage unavailable');
    const key = publicUploadKey(new URL(c.req.url).pathname);
    if (!key) return c.text('Bad Request', 400);
    const response = await objectReadResponse(c.req.raw, runtime.storage, key, {
        'Cache-Control': 'public, max-age=31536000, immutable'
    });
    return response ?? c.text('Not Found', 404);
}
