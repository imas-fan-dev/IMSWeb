import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { services } from '@/middleware/hono-context';

export async function handleServeChronicleAdmin(c: Context<AppEnvironment>): Promise<Response> {
    const assets = services(c).staticAssets;
    return assets
        ? assets.fetch(new Request(new URL('/eventchronicleadmin.html', c.req.url), c.req.raw))
        : c.text('Not Found', 404);
}
