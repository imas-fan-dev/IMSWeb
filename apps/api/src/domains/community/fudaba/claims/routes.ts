import {
    fudabaClaimEnvelopeActionRequestSchema,
    fudabaClaimEnvelopeParamsSchema,
    fudabaLegacyCardClaimParamsSchema,
    fudabaLegacyCardClaimRequestSchema,
} from '@imsweb/contracts/fudaba/card-claims';
import { fudabaIgnoredQuerySchema } from '@imsweb/contracts/fudaba';
import { activePlatformMutation, platformAuth, platformCsrf } from '@/middleware/hono-auth';
import { requireFudabaWrite } from '@/domains/community/fudaba/access-policy';
import {
    handleCreateFudabaLegacyCardClaim,
    handleListFudabaClaimEnvelopes,
    handleListFudabaOwnerCardClaims,
    handleRespondFudabaClaimEnvelope
} from '@/domains/community/fudaba/claims/handlers/card-claims';
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
        '/me/claim-envelopes',
        platformAuth,
        querySchemaValidator(fudabaIgnoredQuerySchema),
        handleListFudabaClaimEnvelopes
    );
    routes.get(
        '/me/card-claims',
        platformAuth,
        querySchemaValidator(fudabaIgnoredQuerySchema),
        handleListFudabaOwnerCardClaims
    );
    routes.post(
        '/legacy-cards/:legacyCardId/claims',
        ...write,
        paramSchemaValidator(fudabaLegacyCardClaimParamsSchema),
        jsonSchemaValidator(fudabaLegacyCardClaimRequestSchema),
        handleCreateFudabaLegacyCardClaim
    );
    routes.put(
        '/me/claim-envelopes/:envelopeId',
        ...write,
        paramSchemaValidator(fudabaClaimEnvelopeParamsSchema),
        jsonSchemaValidator(fudabaClaimEnvelopeActionRequestSchema),
        handleRespondFudabaClaimEnvelope
    );
    return routes;
}
