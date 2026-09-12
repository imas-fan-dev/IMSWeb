import {
    fudabaOfficeIdParamsSchema,
    fudabaOwnerLocationSaveRequestSchema,
    fudabaPlaceSearchQuerySchema,
    fudabaRevisionRequestSchema,
} from "@imsweb/contracts/fudaba";
import {
    activePlatformMutation,
    platformAuth,
    platformCsrf,
} from "@/middleware/hono-auth";
import { requireFudabaWrite } from "@/domains/community/fudaba/access-policy";
import { handleGetFudabaOwnerLocation } from "@/domains/community/fudaba/locations/handlers/get-owner-location";
import { handleSaveFudabaOwnerLocation } from "@/domains/community/fudaba/locations/handlers/save-owner-location";
import { handleSearchFudabaPlaces } from "@/domains/community/fudaba/locations/handlers/search-places";
import { handleWithdrawFudabaOwnerLocation } from "@/domains/community/fudaba/locations/handlers/withdraw-owner-location";
import {
    platformLocationRateLimit,
    platformWriteRateLimit,
} from "@/middleware/platform-mutation-limit";
import { jsonSchemaValidator, paramSchemaValidator, querySchemaValidator } from "@/middleware/request-validation";
import {
    createCapabilityRouter,
    type ImsCapabilityRouter,
} from "@/routing/capability-router";

const locationWrite = [
    requireFudabaWrite,
    platformAuth,
    activePlatformMutation,
    platformCsrf,
    platformLocationRateLimit,
    platformWriteRateLimit,
] as const;

export function fudabaLocationRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        "/places/search",
        requireFudabaWrite,
        platformAuth,
        querySchemaValidator(fudabaPlaceSearchQuerySchema),
        handleSearchFudabaPlaces,
    );
    routes.get(
        "/me/offices/:officeId/location",
        platformAuth,
        paramSchemaValidator(fudabaOfficeIdParamsSchema),
        handleGetFudabaOwnerLocation,
    );
    routes.put(
        "/me/offices/:officeId/location",
        ...locationWrite,
        paramSchemaValidator(fudabaOfficeIdParamsSchema),
        jsonSchemaValidator(fudabaOwnerLocationSaveRequestSchema),
        handleSaveFudabaOwnerLocation,
    );
    routes.delete(
        "/me/offices/:officeId/location",
        ...locationWrite,
        paramSchemaValidator(fudabaOfficeIdParamsSchema),
        jsonSchemaValidator(fudabaRevisionRequestSchema),
        handleWithdrawFudabaOwnerLocation,
    );
    return routes;
}
