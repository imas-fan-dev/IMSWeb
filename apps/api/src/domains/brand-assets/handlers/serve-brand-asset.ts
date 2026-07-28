import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { brandAssetDefinition } from '@/domains/brand-assets/data';
import { services } from '@/middleware/hono-context';
import { objectReadResponse } from '@/utils/http/object-read-response';
import { storedObjectResponse } from '@/utils/http/stored-object-response';

export async function handleServeBrandAsset(
    c: Context<AppEnvironment>
): Promise<Response> {
    const pathname = new URL(c.req.raw.url).pathname;
    const asset = brandAssetDefinition(pathname);
    if (!asset) return c.text('Not Found', 404);

    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const cacheHeaders = { 'Cache-Control': 'public, max-age=300' };
    if (asset.kind === 'font') {
        const object = await storage.get(asset.objectKey);
        return object
            ? storedObjectResponse(c.req.raw, object, cacheHeaders)
            : c.text('Not Found', 404);
    }
    const response = await objectReadResponse(c.req.raw, storage, asset.objectKey, {
        'Cache-Control': 'public, max-age=300'
    });
    return response ?? c.text('Not Found', 404);
}
