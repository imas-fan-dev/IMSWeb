import type { ImsHonoApp } from '@/app';
import { handleCreateHomepageLink } from '@/domains/homepage-links/handlers/create-homepage-link';
import { handleDeleteHomepageLink } from '@/domains/homepage-links/handlers/delete-homepage-link';
import { handleListHomepageLinks } from '@/domains/homepage-links/handlers/list-homepage-links';
import { handleReorderHomepageLinks } from '@/domains/homepage-links/handlers/reorder-homepage-links';
import { handleUpdateHomepageLink } from '@/domains/homepage-links/handlers/update-homepage-link';
import {
    validateHomepageLinkOrderRequest,
    validateHomepageLinkUpdateRequest,
    validateNewHomepageLinkRequest
} from '@/domains/homepage-links/data';
import { coreAuth, coreCsrf, opOnly } from '@/middleware/hono-auth';
import { jsonValidator } from '@/middleware/request-validation';

export function registerHomepageLinkRoutes(app: ImsHonoApp): void {
    app.get('/api/homepage-links', handleListHomepageLinks);
    app.get('/api/admin/homepage-links', coreAuth, opOnly, handleListHomepageLinks);
    app.post(
        '/api/admin/homepage-links',
        coreAuth,
        opOnly,
        coreCsrf,
        jsonValidator(validateNewHomepageLinkRequest),
        handleCreateHomepageLink
    );
    app.put(
        '/api/admin/homepage-links/:section/order',
        coreAuth,
        opOnly,
        coreCsrf,
        jsonValidator(validateHomepageLinkOrderRequest),
        handleReorderHomepageLinks
    );
    app.put(
        '/api/admin/homepage-links/:id',
        coreAuth,
        opOnly,
        coreCsrf,
        jsonValidator(validateHomepageLinkUpdateRequest),
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
