import type { ImsHonoApp } from '@/app';
import { handleServeSiteIndex } from '@/domains/delivery/site/handlers/serve-site-index';

export function registerSiteRoutes(app: ImsHonoApp): void {
    app.on(['GET', 'HEAD'], '/', handleServeSiteIndex);
}
