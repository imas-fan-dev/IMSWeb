import { activePlatformMutation, platformAuth, platformCsrf } from '@/middleware/hono-auth';
import { requireFudabaWrite } from '@/domains/community/fudaba/access-policy';
import { handleGetFudabaOwnerLocation } from '@/domains/community/fudaba/locations/handlers/get-owner-location';
import { handleSaveFudabaOwnerLocation } from '@/domains/community/fudaba/locations/handlers/save-owner-location';
import { handleWithdrawFudabaOwnerLocation } from '@/domains/community/fudaba/locations/handlers/withdraw-owner-location';
import {
    platformLocationRateLimit,
    platformWriteRateLimit
} from '@/middleware/platform-mutation-limit';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

const locationWrite = [
    requireFudabaWrite,
    platformAuth,
    activePlatformMutation,
    platformCsrf,
    platformLocationRateLimit,
    platformWriteRateLimit
] as const;

export function fudabaLocationRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        '/me/offices/:officeId/location',
        platformAuth,
        handleGetFudabaOwnerLocation
    );
    routes.put(
        '/me/offices/:officeId/location',
        ...locationWrite,
        handleSaveFudabaOwnerLocation
    );
    routes.delete(
        '/me/offices/:officeId/location',
        ...locationWrite,
        handleWithdrawFudabaOwnerLocation
    );
    return routes;
}
