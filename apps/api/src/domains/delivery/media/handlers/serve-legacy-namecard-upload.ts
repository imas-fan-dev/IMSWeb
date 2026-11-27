import { publicUploadsPath } from '@imsweb/contracts/paths';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { MEDIA_NOT_FOUND_RESPONSE, mediaTextResponse } from '@/domains/delivery/media/response';
import { services } from '@/middleware/hono-context';
import { storedObjectResponse } from '@/utils/http/stored-object-response';

const originalPrefix = publicUploadsPath('/namecard/original/');
const thumbnailPrefix = publicUploadsPath('/namecard/thumbnail/');

export async function handleServeLegacyNamecardUpload(c: Context<AppEnvironment>): Promise<Response> {
    const path = new URL(c.req.url).pathname;
    const validPath = (path.startsWith(originalPrefix) &&
        /^[A-Za-z0-9._-]+\.[A-Za-z0-9]+$/.test(path.slice(originalPrefix.length))) ||
        (path.startsWith(thumbnailPrefix) &&
            /^[A-Za-z0-9._-]+\.[A-Za-z0-9]+\.jpg$/.test(path.slice(thumbnailPrefix.length)));
    const { namecards, storage } = services(c);
    const missing = () => mediaTextResponse(c, MEDIA_NOT_FOUND_RESPONSE);
    if (!validPath || !namecards || !storage?.getPublicVersion) return missing();

    const alias = await namecards.findPublishedLegacyUpload(path);
    if (!alias) return missing();
    const object = await storage.getPublicVersion(alias.key, alias.objectId);
    if (!object || !/^image\/(?:jpeg|png|gif|webp|avif|bmp)$/.test(object.contentType)) return missing();
    return storedObjectResponse(c.req.raw, object, {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
}
