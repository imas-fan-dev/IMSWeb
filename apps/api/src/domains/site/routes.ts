import type { ImsHonoApp } from '@/app';
import { handleServeSiteIndex } from '@/domains/site/handlers/serve-site-index';

export function registerSiteRoutes(app: ImsHonoApp): void {
    app.on(['GET', 'HEAD'], '/', handleServeSiteIndex);
}
