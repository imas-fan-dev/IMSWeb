import {
    fudabaAdminCardClaimParamsSchema,
    fudabaCardReviewRequestSchema,
    fudabaRegisteredCardReviewParamsSchema,
} from '@imsweb/contracts/fudaba/card-claims';
import {
    fudabaLocationReviewOfficeParamsSchema,
    fudabaLocationReviewQuerySchema,
    fudabaLocationReviewRequestSchema,
} from '@imsweb/contracts/fudaba/location-review';
import {
    backofficeAuth,
    backofficeCsrf,
    currentBackofficeOp
} from '@/middleware/hono-auth';
import {
    handleListFudabaCardClaimReviews,
    handleListFudabaRegisteredCardReviews,
    handleReviewFudabaCardClaim,
    handleReviewFudabaRegisteredCard,
    handleServeFudabaRegisteredCardReviewMedia
} from '@/domains/community/fudaba/moderation/handlers/admin-card-reviews';
import { handleListFudabaLocationReviews } from '@/domains/community/fudaba/moderation/handlers/list-location-reviews';
import { handleReviewFudabaLocation } from '@/domains/community/fudaba/moderation/handlers/review-location';
import { jsonSchemaValidator, paramSchemaValidator, querySchemaValidator } from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

export function fudabaModerationRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        '/office-locations',
        backofficeAuth,
        currentBackofficeOp,
        querySchemaValidator(fudabaLocationReviewQuerySchema),
        handleListFudabaLocationReviews
    );
    routes.put(
        '/office-locations/:officeId',
        backofficeAuth,
        currentBackofficeOp,
        backofficeCsrf,
        paramSchemaValidator(fudabaLocationReviewOfficeParamsSchema),
        jsonSchemaValidator(fudabaLocationReviewRequestSchema),
        handleReviewFudabaLocation
    );
    routes.get(
        '/card-reviews',
        backofficeAuth,
        currentBackofficeOp,
        handleListFudabaRegisteredCardReviews
    );
    routes.get(
        '/card-reviews/:cardId/media/:side',
        backofficeAuth,
        currentBackofficeOp,
        handleServeFudabaRegisteredCardReviewMedia
    );
    routes.on(
        'HEAD',
        '/card-reviews/:cardId/media/:side',
        backofficeAuth,
        currentBackofficeOp,
        handleServeFudabaRegisteredCardReviewMedia
    );
    routes.put(
        '/card-reviews/:cardId',
        backofficeAuth,
        currentBackofficeOp,
        backofficeCsrf,
        paramSchemaValidator(fudabaRegisteredCardReviewParamsSchema),
        jsonSchemaValidator(fudabaCardReviewRequestSchema),
        handleReviewFudabaRegisteredCard
    );
    routes.get(
        '/card-claims',
        backofficeAuth,
        currentBackofficeOp,
        handleListFudabaCardClaimReviews
    );
    routes.put(
        '/card-claims/:claimId',
        backofficeAuth,
        currentBackofficeOp,
        backofficeCsrf,
        paramSchemaValidator(fudabaAdminCardClaimParamsSchema),
        jsonSchemaValidator(fudabaCardReviewRequestSchema),
        handleReviewFudabaCardClaim
    );
    return routes;
}
