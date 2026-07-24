import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { services } from '@/middleware/hono-context';

export async function handleServeSiteIndex(c: Context<AppEnvironment>): Promise<Response> {
    const assets = services(c).staticAssets;
    if (!assets) return c.text('Not Found', 404);
    const url = new URL(c.req.url);
    url.pathname = '/index.html';
    url.search = '';
    return assets.fetch(new Request(url, c.req.raw));
}
