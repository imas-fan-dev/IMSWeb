import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    brandAssetNotFoundResponse,
    brandAssetObjectResponse
} from '@/domains/content/brand-assets/response';
import { brandAssetDefinition } from '@/domains/content/brand-assets/data';
import { services } from '@/middleware/hono-context';

export async function handleServeBrandAsset(
    c: Context<AppEnvironment>
): Promise<Response> {
    let pathname: string;
    try {
        pathname = new URL(c.req.raw.url).pathname;
    } catch {
        return brandAssetNotFoundResponse(c);
    }
    const asset = brandAssetDefinition(pathname);
    if (!asset) return brandAssetNotFoundResponse(c);

    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const response = await brandAssetObjectResponse(c.req.raw, storage, asset);
    return response ?? brandAssetNotFoundResponse(c);
}
