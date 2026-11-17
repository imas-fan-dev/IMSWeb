import {
    adminCardSupplementParamsSchema,
    fudabaAdminCardClaimParamsSchema,
    fudabaCardReviewRequestSchema,
    fudabaRegisteredCardReviewParamsSchema,
    fudabaSupplementReviewRequestSchema,
    reviewQueueQuerySchema,
} from '@imsweb/contracts/fudaba/card-claims';
import {
    fudabaLocationReviewOfficeParamsSchema,
    fudabaLocationReviewQuerySchema,
} from '@imsweb/contracts/fudaba/location-review';
import { adminOfficeReviewRequestSchema } from '@imsweb/contracts/fudaba/office-review';
import {
    fudabaOfficeIdParamsSchema,
    fudabaOfficeUpdateRequestSchema,
} from '@imsweb/contracts/fudaba';
import {
    handleGetAdminFudabaOffice,
    handleListAdminFudabaOffices,
    handleServeAdminFudabaOfficeMedia,
    handleUpdateAdminFudabaOffice,
} from '@/domains/community/fudaba/moderation/handlers/admin-offices';
import { handleReviewFudabaOffice } from '@/domains/community/fudaba/moderation/handlers/review-office';
import {
    backofficeAuth,
    backofficeCsrf,
    currentBackofficeOp,
} from '@/middleware/hono-auth';
import {
    handleGetFudabaCardSupplement,
    handleListFudabaCardClaimReviews,
    handleListFudabaCardSupplements,
    handleListFudabaRegisteredCardReviews,
    handleListFudabaReviewQueue,
    handleReviewFudabaCardClaim,
    handleReviewFudabaCardSupplement,
    handleReviewFudabaRegisteredCard,
} from '@/domains/community/fudaba/moderation/handlers/admin-card-reviews';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator,
} from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter,
} from '@/routing/capability-router';

export function fudabaModerationRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        '/offices',
        backofficeAuth,
        currentBackofficeOp,
        querySchemaValidator(fudabaLocationReviewQuerySchema),
        handleListAdminFudabaOffices,
    );
    routes.put(
        '/offices/:officeId/review',
        backofficeAuth,
        currentBackofficeOp,
        backofficeCsrf,
        paramSchemaValidator(fudabaLocationReviewOfficeParamsSchema),
        jsonSchemaValidator(adminOfficeReviewRequestSchema),
        handleReviewFudabaOffice,
    );
    routes.get(
        '/offices/:officeId',
        backofficeAuth,
        currentBackofficeOp,
        paramSchemaValidator(fudabaOfficeIdParamsSchema),
        handleGetAdminFudabaOffice,
    );
    routes.put(
        '/offices/:officeId',
        backofficeAuth,
        currentBackofficeOp,
        backofficeCsrf,
        paramSchemaValidator(fudabaOfficeIdParamsSchema),
        jsonSchemaValidator(fudabaOfficeUpdateRequestSchema),
        handleUpdateAdminFudabaOffice,
    );
    routes.get(
        '/offices/:officeId/media/:slot',
        backofficeAuth,
        currentBackofficeOp,
        handleServeAdminFudabaOfficeMedia,
    );
    routes.on(
        'HEAD',
        '/offices/:officeId/media/:slot',
        backofficeAuth,
        currentBackofficeOp,
        handleServeAdminFudabaOfficeMedia,
    );
    routes.get(
        '/card-reviews',
        backofficeAuth,
        currentBackofficeOp,
        handleListFudabaRegisteredCardReviews,
    );
    routes.put(
        '/card-reviews/:cardId',
        backofficeAuth,
        currentBackofficeOp,
        backofficeCsrf,
        paramSchemaValidator(fudabaRegisteredCardReviewParamsSchema),
        jsonSchemaValidator(fudabaCardReviewRequestSchema),
        handleReviewFudabaRegisteredCard,
    );
    routes.get(
        '/card-claims',
        backofficeAuth,
        currentBackofficeOp,
        handleListFudabaCardClaimReviews,
    );
    routes.get(
        '/review-queue',
        backofficeAuth,
        currentBackofficeOp,
        querySchemaValidator(reviewQueueQuerySchema),
        handleListFudabaReviewQueue,
    );
    routes.get(
        '/card-supplements',
        backofficeAuth,
        currentBackofficeOp,
        handleListFudabaCardSupplements,
    );
    routes.get(
        '/card-supplements/:supplementId',
        backofficeAuth,
        currentBackofficeOp,
        paramSchemaValidator(adminCardSupplementParamsSchema),
        handleGetFudabaCardSupplement,
    );
    routes.put(
        '/card-supplements/:supplementId',
        backofficeAuth,
        currentBackofficeOp,
        backofficeCsrf,
        paramSchemaValidator(adminCardSupplementParamsSchema),
        jsonSchemaValidator(fudabaSupplementReviewRequestSchema),
        handleReviewFudabaCardSupplement,
    );
    routes.put(
        '/card-claims/:claimId',
        backofficeAuth,
        currentBackofficeOp,
        backofficeCsrf,
        paramSchemaValidator(fudabaAdminCardClaimParamsSchema),
        jsonSchemaValidator(fudabaCardReviewRequestSchema),
        handleReviewFudabaCardClaim,
    );
    return routes;
}
