import type { ImsHonoApp } from '@/app';
import { handleCreateHomepageLink } from '@/domains/homepage-links/handlers/create-homepage-link';
import { handleDeleteHomepageLink } from '@/domains/homepage-links/handlers/delete-homepage-link';
import { handleListHomepageLinks } from '@/domains/homepage-links/handlers/list-homepage-links';
import { handleReorderHomepageLinks } from '@/domains/homepage-links/handlers/reorder-homepage-links';
import { handleUpdateHomepageLink } from '@/domains/homepage-links/handlers/update-homepage-link';
import { coreAuth, coreCsrf, opOnly } from '@/middleware/hono-auth';

export function registerHomepageLinkRoutes(app: ImsHonoApp): void {
    app.get('/api/homepage-links', handleListHomepageLinks);
    app.get('/api/admin/homepage-links', coreAuth, opOnly, handleListHomepageLinks);
    app.post('/api/admin/homepage-links', coreAuth, opOnly, coreCsrf, handleCreateHomepageLink);
    app.put(
        '/api/admin/homepage-links/:section/order',
        coreAuth,
        opOnly,
        coreCsrf,
        handleReorderHomepageLinks
    );
    app.put(
        '/api/admin/homepage-links/:id',
        coreAuth,
        opOnly,
        coreCsrf,
        handleUpdateHomepageLink
    );
    app.delete(
        '/api/admin/homepage-links/:id',
        coreAuth,
        opOnly,
        coreCsrf,
        handleDeleteHomepageLink
    );
}
