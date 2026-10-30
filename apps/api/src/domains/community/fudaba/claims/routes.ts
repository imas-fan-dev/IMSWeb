import {
    fudabaCardSupplementRequestSchema,
    fudabaCardSupplementSubmitParamsSchema,
    fudabaLegacyCardClaimParamsSchema,
    fudabaLegacyCardClaimRequestSchema,
    namecardNotificationReadRequestSchema,
} from '@imsweb/contracts/fudaba/card-claims';
import { fudabaIgnoredQuerySchema } from '@imsweb/contracts/fudaba';
import { activePlatformMutation, platformAuth, platformCsrf } from '@/middleware/hono-auth';
import { requireFudabaWrite } from '@/domains/community/fudaba/access-policy';
import {
    handleCreateFudabaCardSupplement,
    handleCreateFudabaLegacyCardClaim,
    handleListFudabaOwnerCardClaims
} from '@/domains/community/fudaba/claims/handlers/card-claims';
import {
    handleListNamecardNotifications,
    handleMarkNamecardNotificationsRead
} from '@/domains/community/fudaba/claims/handlers/namecard-notifications';
import { platformWriteRateLimit } from '@/middleware/platform-mutation-limit';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator,
} from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

const write = [
    requireFudabaWrite,
    platformAuth,
    activePlatformMutation,
    platformCsrf,
    platformWriteRateLimit
] as const;

export function fudabaClaimRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        '/me/card-claims',
        platformAuth,
        querySchemaValidator(fudabaIgnoredQuerySchema),
        handleListFudabaOwnerCardClaims
    );
    routes.get(
        '/me/notifications',
        platformAuth,
        querySchemaValidator(fudabaIgnoredQuerySchema),
        handleListNamecardNotifications
    );
    routes.post(
        '/me/notifications/read',
        ...write,
        jsonSchemaValidator(namecardNotificationReadRequestSchema),
        handleMarkNamecardNotificationsRead
    );
    routes.post(
        '/legacy-cards/:legacyCardId/claims',
        ...write,
        paramSchemaValidator(fudabaLegacyCardClaimParamsSchema),
        jsonSchemaValidator(fudabaLegacyCardClaimRequestSchema),
        handleCreateFudabaLegacyCardClaim
    );
    routes.post(
        '/cards/:cardId/supplements',
        ...write,
        paramSchemaValidator(fudabaCardSupplementSubmitParamsSchema),
        jsonSchemaValidator(fudabaCardSupplementRequestSchema),
        handleCreateFudabaCardSupplement
    );
    return routes;
}
