import type { ImsHonoApp } from '@/app';
import { handleCreateHomepageLink } from '@/domains/homepage-links/handlers/create-homepage-link';
import { handleDeleteHomepageLink } from '@/domains/homepage-links/handlers/delete-homepage-link';
import { handleListHomepageLinks } from '@/domains/homepage-links/handlers/list-homepage-links';
import { handleReorderHomepageLinks } from '@/domains/homepage-links/handlers/reorder-homepage-links';
import { handleUpdateHomepageLink } from '@/domains/homepage-links/handlers/update-homepage-link';
import {
    validateHomepageLinkIdParams,
    validateHomepageLinkOrderRequest,
    validateHomepageLinkSectionParams,
    validateHomepageLinkUpdateRequest,
    validateNewHomepageLinkRequest
} from '@/domains/homepage-links/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import { jsonValidator, paramValidator } from '@/middleware/request-validation';

const homepageLinkIdValidator = paramValidator(validateHomepageLinkIdParams);
const homepageLinkSectionValidator = paramValidator(validateHomepageLinkSectionParams);

export function registerHomepageLinkRoutes(app: ImsHonoApp): void {
    app.get('/api/homepage-links', handleListHomepageLinks);
    app.get('/api/admin/homepage-links', backofficeAuth, opOnly, handleListHomepageLinks);
    app.post(
        '/api/admin/homepage-links',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonValidator(validateNewHomepageLinkRequest),
        handleCreateHomepageLink
    );
    app.put(
        '/api/admin/homepage-links/:section/order',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonValidator(validateHomepageLinkOrderRequest),
        homepageLinkSectionValidator,
        handleReorderHomepageLinks
    );
    app.put(
        '/api/admin/homepage-links/:id',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonValidator(validateHomepageLinkUpdateRequest),
        homepageLinkIdValidator,
        handleUpdateHomepageLink
    );
    app.delete(
        '/api/admin/homepage-links/:id',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        homepageLinkIdValidator,
        handleDeleteHomepageLink
    );
}
