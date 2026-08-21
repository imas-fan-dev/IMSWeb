import { handleGetNamecard } from "@/domains/community/namecards/public-cards/handlers/get-namecard";
import { handleListNamecards } from "@/domains/community/namecards/public-cards/handlers/list-namecards";
import {
    validateCompatibleNamecardIdParams,
    validateNamecardListQuery,
} from "@/domains/community/namecards/request";
import { optionalPlatformAuth } from "@/middleware/hono-auth";
import { paramValidator, queryValidator } from "@/middleware/request-validation";
import {
    createCapabilityRouter,
    type ImsCapabilityRouter,
} from "@/routing/capability-router";

export function namecardPublicCardRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        "/cards",
        optionalPlatformAuth,
        queryValidator(validateNamecardListQuery),
        handleListNamecards,
    );
    routes.get(
        "/card/:id",
        paramValidator(validateCompatibleNamecardIdParams),
        handleGetNamecard,
    );
    return routes;
}
