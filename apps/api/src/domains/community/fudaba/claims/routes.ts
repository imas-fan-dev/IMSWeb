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
        handleListFudabaClaimEnvelopes
    );
    routes.get(
        '/me/card-claims',
        platformAuth,
        handleListFudabaOwnerCardClaims
    );
    routes.post(
        '/legacy-cards/:legacyCardId/claims',
        ...write,
        handleCreateFudabaLegacyCardClaim
    );
    routes.put(
        '/me/claim-envelopes/:envelopeId',
        ...write,
        handleRespondFudabaClaimEnvelope
    );
    return routes;
}
