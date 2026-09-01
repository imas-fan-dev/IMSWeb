import { requireFudabaMap } from '@/domains/community/fudaba/access-policy';
import { handleActivateFudabaMapSource } from '@/domains/community/fudaba/map-delivery/handlers/activate-map-source';
import { handleCreateFudabaMapSource } from '@/domains/community/fudaba/map-delivery/handlers/create-map-source';
import { handleDeleteFudabaMapSource } from '@/domains/community/fudaba/map-delivery/handlers/delete-map-source';
import { handleGetFudabaMapDelivery } from '@/domains/community/fudaba/map-delivery/handlers/get-map-delivery';
import { handleUpdateFudabaMapSource } from '@/domains/community/fudaba/map-delivery/handlers/update-map-source';
import {
    backofficeAuth,
    backofficeCsrf,
    currentBackofficeOp,
} from '@/middleware/hono-auth';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter,
} from '@/routing/capability-router';

export function fudabaMapDeliveryRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        '/map-delivery',
        backofficeAuth,
        currentBackofficeOp,
        requireFudabaMap,
        handleGetFudabaMapDelivery,
    );
    routes.post(
        '/map-delivery/sources',
        backofficeAuth,
        currentBackofficeOp,
        requireFudabaMap,
        backofficeCsrf,
        handleCreateFudabaMapSource,
    );
    routes.put(
        '/map-delivery/sources/:sourceId',
        backofficeAuth,
        currentBackofficeOp,
        requireFudabaMap,
        backofficeCsrf,
        handleUpdateFudabaMapSource,
    );
    routes.delete(
        '/map-delivery/sources/:sourceId',
        backofficeAuth,
        currentBackofficeOp,
        requireFudabaMap,
        backofficeCsrf,
        handleDeleteFudabaMapSource,
    );
    routes.put(
        '/map-delivery/active',
        backofficeAuth,
        currentBackofficeOp,
        requireFudabaMap,
        backofficeCsrf,
        handleActivateFudabaMapSource,
    );
    return routes;
}
