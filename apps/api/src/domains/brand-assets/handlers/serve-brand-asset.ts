import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    brandAssetNotFoundResponse,
    brandAssetObjectResponse
} from '@/domains/brand-assets/response';
import { brandAssetDefinition } from '@/domains/brand-assets/data';
import { services } from '@/middleware/hono-context';

export async function handleServeBrandAsset(
    c: Context<AppEnvironment>
): Promise<Response> {
    const pathname = new URL(c.req.raw.url).pathname;
    const asset = brandAssetDefinition(pathname);
    if (!asset) return brandAssetNotFoundResponse(c);

    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const response = await brandAssetObjectResponse(c.req.raw, storage, asset);
    return response ?? brandAssetNotFoundResponse(c);
}
