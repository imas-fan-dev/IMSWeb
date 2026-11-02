import { handleGetNamecard } from "@/domains/community/namecards/public-cards/handlers/get-namecard";
import { handleGetPublicProfile } from "@/domains/community/namecards/public-profiles/handlers/get-public-profile";
import { handleListProfileCards } from "@/domains/community/namecards/public-profiles/handlers/list-profile-cards";
import { handleGetRandomOwnerlessCard } from "@/domains/community/namecards/public-cards/handlers/get-random-ownerless-card";
import { handleGetWallInsights } from "@/domains/community/namecards/public-cards/handlers/get-wall-insights";
import { handleListNamecards } from "@/domains/community/namecards/public-cards/handlers/list-namecards";
import { fudabaMediaQuerySchema } from "@imsweb/contracts/fudaba";
import { handleServePublicCardMedia } from "@/domains/community/namecards/public-cards/handlers/serve-card-media";
import {
    validateCompatibleNamecardIdParams,
    validateNamecardListQuery,
    validateNamecardMediaParams,
} from "@/domains/community/namecards/request";
import {
    compatibleNamecardIdParamsSchema,
    publicProfileParamsSchema,
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
        querySchemaValidator(fudabaMediaQuerySchema),
        handleServePublicCardMedia,
    );
    // 用户主页：资料与本人名片分开取，资料变化不影响列表缓存。
    routes.get(
        "/users/:accountId",
        optionalPlatformAuth,
        paramSchemaValidator(publicProfileParamsSchema),
        handleGetPublicProfile,
    );
    routes.get(
        "/users/:accountId/cards",
        optionalPlatformAuth,
        paramSchemaValidator(publicProfileParamsSchema),
        handleListProfileCards,
    );
    routes.get(
        "/card/:id",
        paramSchemaValidator(compatibleNamecardIdParamsSchema, { invalidMessage: "名片 ID 无效" }, validateCompatibleNamecardIdParams),
        handleGetNamecard,
    );
    return routes;
}
