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
        handleListFudabaLocationReviews
    );
    routes.put(
        '/office-locations/:officeId',
        backofficeAuth,
        currentBackofficeOp,
        backofficeCsrf,
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
        handleReviewFudabaCardClaim
    );
    return routes;
}
