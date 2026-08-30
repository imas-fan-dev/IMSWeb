import { requireFudabaMap } from '@/domains/community/fudaba/access-policy';
import { handleGetFudabaMapDelivery } from '@/domains/community/fudaba/map-delivery/handlers/get-map-delivery';
import { handleUpdateFudabaMapDelivery } from '@/domains/community/fudaba/map-delivery/handlers/update-map-delivery';
import {
    backofficeAuth,
    backofficeCsrf,
    currentBackofficeOp
} from '@/middleware/hono-auth';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

export function fudabaMapDeliveryRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        '/map-delivery',
        backofficeAuth,
        currentBackofficeOp,
        requireFudabaMap,
        handleGetFudabaMapDelivery
    );
    routes.put(
        '/map-delivery',
        backofficeAuth,
        currentBackofficeOp,
        requireFudabaMap,
        backofficeCsrf,
        handleUpdateFudabaMapDelivery
    );
    return routes;
}
