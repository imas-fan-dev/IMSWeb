import type { ImsHonoApp } from '@/app';
import { handleGetAboutPage } from '@/domains/about/handlers/get-about-page';
import { handleGetAdminAboutPage } from '@/domains/about/handlers/get-admin-about-page';
import { handleUpdateAboutPage } from '@/domains/about/handlers/update-about-page';
import { coreAuth, coreCsrf, opOnly } from '@/middleware/hono-auth';

export function registerAboutRoutes(app: ImsHonoApp): void {
    app.get('/api/about', handleGetAboutPage);
    app.get('/api/admin/about', coreAuth, opOnly, handleGetAdminAboutPage);
    app.put('/api/admin/about', coreAuth, opOnly, coreCsrf, handleUpdateAboutPage);
}
