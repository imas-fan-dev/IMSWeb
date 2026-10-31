import { handleGetNamecard } from "@/domains/community/namecards/public-cards/handlers/get-namecard";
import { handleGetRandomOwnerlessCard } from "@/domains/community/namecards/public-cards/handlers/get-random-ownerless-card";
import { handleGetWallInsights } from "@/domains/community/namecards/public-cards/handlers/get-wall-insights";
import { handleListNamecards } from "@/domains/community/namecards/public-cards/handlers/list-namecards";
import { handleServePublicCardMedia } from "@/domains/community/namecards/public-cards/handlers/serve-card-media";
import {
    validateCompatibleNamecardIdParams,
    validateNamecardListQuery,
    validateNamecardMediaParams,
} from "@/domains/community/namecards/request";
import {
    compatibleNamecardIdParamsSchema,
    namecardListQuerySchema,
    namecardMediaParamsSchema,
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
    // 墙顶面板的读数与「随机补充」入口都在 /cards 下，静态段优先于 /cards/:id。
    routes.get(
        "/cards/wall-insights",
        optionalPlatformAuth,
        handleGetWallInsights,
    );
    routes.get(
        "/cards/random-ownerless",
        optionalPlatformAuth,
        handleGetRandomOwnerlessCard,
    );
    // Wall artwork addresses middle pages by card number: the editor's object
    // layout has no reversible public path.
    routes.get(
        "/cards/:id/media/:side",
        paramSchemaValidator(namecardMediaParamsSchema, { invalidMessage: "名片 ID 无效" }, validateNamecardMediaParams),
        handleServePublicCardMedia,
    );
    routes.get(
        "/card/:id",
        paramSchemaValidator(compatibleNamecardIdParamsSchema, { invalidMessage: "名片 ID 无效" }, validateCompatibleNamecardIdParams),
        handleGetNamecard,
    );
    return routes;
}
