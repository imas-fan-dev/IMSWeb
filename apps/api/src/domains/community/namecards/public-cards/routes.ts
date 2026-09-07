import { handleGetNamecard } from "@/domains/community/namecards/public-cards/handlers/get-namecard";
import { handleListNamecards } from "@/domains/community/namecards/public-cards/handlers/list-namecards";
import {
    validateCompatibleNamecardIdParams,
    validateNamecardListQuery,
} from "@/domains/community/namecards/request";
import {
    compatibleNamecardIdParamsSchema,
    namecardListQuerySchema,
} from "@imsweb/contracts/namecards";
import { optionalPlatformAuth } from "@/middleware/hono-auth";
import { paramSchemaValidator, querySchemaValidator } from "@/middleware/request-validation";
import {
    createCapabilityRouter,
    type ImsCapabilityRouter,
} from "@/routing/capability-router";

export function namecardPublicCardRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get(
        "/cards",
        optionalPlatformAuth,
        querySchemaValidator(namecardListQuerySchema, { invalidMessage: "名片分页参数无效" }, validateNamecardListQuery),
        handleListNamecards,
    );
    routes.get(
        "/card/:id",
        paramSchemaValidator(compatibleNamecardIdParamsSchema, { invalidMessage: "名片 ID 无效" }, validateCompatibleNamecardIdParams),
        handleGetNamecard,
    );
    return routes;
}
