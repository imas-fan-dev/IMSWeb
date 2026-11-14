import {
    fudabaPlaceSearchQuerySchema,
    fudabaPlaceReverseQuerySchema,
} from '@imsweb/contracts/fudaba';
import {
    platformAuth,
    backofficeAuth,
    currentBackofficeOp,
} from '@/middleware/hono-auth';
import { requireFudabaPlaceSearch } from '@/domains/community/fudaba/locations/place-search-policy';
import { handleSearchFudabaPlaces } from '@/domains/community/fudaba/locations/handlers/search-places';
import { handleReverseFudabaPlace } from '@/domains/community/fudaba/locations/handlers/reverse-place';
import { querySchemaValidator } from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter,
} from '@/routing/capability-router';

export function fudabaLocationRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        '/places/reverse',
        platformAuth,
        requireFudabaPlaceSearch,
        querySchemaValidator(fudabaPlaceReverseQuerySchema),
        handleReverseFudabaPlace,
    );
    routes.get(
        '/places/search',
        requireFudabaPlaceSearch,
        querySchemaValidator(fudabaPlaceSearchQuerySchema),
        handleSearchFudabaPlaces,
    );
    return routes;
}

export function fudabaAdminLocationRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        '/places/reverse',
        backofficeAuth,
        currentBackofficeOp,
        querySchemaValidator(fudabaPlaceReverseQuerySchema),
        handleReverseFudabaPlace,
    );
    routes.get(
        '/places/search',
        backofficeAuth,
        currentBackofficeOp,
        querySchemaValidator(fudabaPlaceSearchQuerySchema),
        handleSearchFudabaPlaces,
    );
    return routes;
}
