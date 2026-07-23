import type { ImsHonoApp } from '@/app';
import { services } from '@/shared/hono-utils';

export function registerSiteRoutes(app: ImsHonoApp): void {
    app.on(['GET', 'HEAD'], '/', async (c) => {
        const assets = services(c).staticAssets;
        if (!assets) return c.text('Not Found', 404);
        const url = new URL(c.req.url);
        url.pathname = '/index.html';
        url.search = '';
        return assets.fetch(new Request(url, c.req.raw));
    });
}
