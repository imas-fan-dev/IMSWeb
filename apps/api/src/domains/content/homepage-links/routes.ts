import { homepageLinkCreateRequestSchema, homepageLinkIdParamsSchema, homepageLinkOrderRequestSchema, homepageLinkSectionParamsSchema, homepageLinkUpdateRequestSchema } from '@imsweb/contracts/homepage-links';
import { adminApiPath, apiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleCreateHomepageLink } from '@/domains/content/homepage-links/handlers/create-homepage-link';
import { handleDeleteHomepageLink } from '@/domains/content/homepage-links/handlers/delete-homepage-link';
import { handleListHomepageLinks } from '@/domains/content/homepage-links/handlers/list-homepage-links';
import { handleReorderHomepageLinks } from '@/domains/content/homepage-links/handlers/reorder-homepage-links';
import { handleUpdateHomepageLink } from '@/domains/content/homepage-links/handlers/update-homepage-link';
import {
    validateHomepageLinkIdParams,
    validateHomepageLinkOrderRequest,
    validateHomepageLinkSectionParams,
    validateHomepageLinkUpdateRequest,
    validateNewHomepageLinkRequest
} from '@/domains/content/homepage-links/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import { jsonSchemaValidator, paramSchemaValidator } from '@/middleware/request-validation';

const homepageLinkIdValidator = paramSchemaValidator(homepageLinkIdParamsSchema, {}, validateHomepageLinkIdParams);
const homepageLinkSectionValidator = paramSchemaValidator(homepageLinkSectionParamsSchema, {}, validateHomepageLinkSectionParams);

export function registerHomepageLinkRoutes(app: ImsHonoApp): void {
    app.get(apiPath('/homepage-links'), handleListHomepageLinks);
    app.get(adminApiPath('/homepage-links'), backofficeAuth, opOnly, handleListHomepageLinks);
    app.post(
        adminApiPath('/homepage-links'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonSchemaValidator(homepageLinkCreateRequestSchema, {}, validateNewHomepageLinkRequest),
        handleCreateHomepageLink
    );
    app.put(
        adminApiPath('/homepage-links/:section/order'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonSchemaValidator(homepageLinkOrderRequestSchema, {}, validateHomepageLinkOrderRequest),
        homepageLinkSectionValidator,
        handleReorderHomepageLinks
    );
    app.put(
        adminApiPath('/homepage-links/:id'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        jsonSchemaValidator(homepageLinkUpdateRequestSchema, {}, validateHomepageLinkUpdateRequest),
        homepageLinkIdValidator,
        handleUpdateHomepageLink
    );
    app.delete(
        adminApiPath('/homepage-links/:id'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        homepageLinkIdValidator,
        handleDeleteHomepageLink
    );
}
