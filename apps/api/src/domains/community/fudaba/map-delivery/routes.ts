import {
    fudabaMapDeliveryQuerySchema,
    fudabaMapSourceActivationRequestSchema,
    fudabaMapSourceDeleteRequestSchema,
    fudabaMapSourceParamsSchema,
    fudabaMapSourceWriteRequestSchema,
} from '@imsweb/contracts/fudaba/map-delivery';
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
    mapDeliveryJsonSchemaValidator,
    mapDeliveryParamSchemaValidator,
} from '@/domains/community/fudaba/map-delivery/request-schema-middleware';
import { querySchemaValidator } from '@/middleware/request-validation';
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
        querySchemaValidator(fudabaMapDeliveryQuerySchema),
        handleGetFudabaMapDelivery,
    );
    routes.post(
        '/map-delivery/sources',
        backofficeAuth,
        currentBackofficeOp,
        requireFudabaMap,
        backofficeCsrf,
        mapDeliveryJsonSchemaValidator(
            fudabaMapSourceWriteRequestSchema,
            'source',
        ),
        handleCreateFudabaMapSource,
    );
    routes.put(
        '/map-delivery/sources/:sourceId',
        backofficeAuth,
        currentBackofficeOp,
        requireFudabaMap,
        backofficeCsrf,
        mapDeliveryParamSchemaValidator(fudabaMapSourceParamsSchema),
        mapDeliveryJsonSchemaValidator(
            fudabaMapSourceWriteRequestSchema,
            'source',
        ),
        handleUpdateFudabaMapSource,
    );
    routes.delete(
        '/map-delivery/sources/:sourceId',
        backofficeAuth,
        currentBackofficeOp,
        requireFudabaMap,
        backofficeCsrf,
        mapDeliveryParamSchemaValidator(fudabaMapSourceParamsSchema),
        mapDeliveryJsonSchemaValidator(
            fudabaMapSourceDeleteRequestSchema,
            'delete',
        ),
        handleDeleteFudabaMapSource,
    );
    routes.put(
        '/map-delivery/active',
        backofficeAuth,
        currentBackofficeOp,
        requireFudabaMap,
        backofficeCsrf,
        mapDeliveryJsonSchemaValidator(
            fudabaMapSourceActivationRequestSchema,
            'activate',
        ),
        handleActivateFudabaMapSource,
    );
    return routes;
}
