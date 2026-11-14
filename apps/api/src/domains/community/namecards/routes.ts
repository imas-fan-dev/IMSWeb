import { adminApiPath, apiPath, communityApiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from "@/app";
import { namecardExchangeRoutes } from "@/domains/community/namecards/exchange/routes";
import { namecardModerationRoutes } from "@/domains/community/namecards/moderation/routes";
import { namecardPublicCardRoutes } from "@/domains/community/namecards/public-cards/routes";
import { namecardReactionRoutes } from "@/domains/community/namecards/reactions/routes";

export function registerNamecardRoutes(app: ImsHonoApp): void {
    app.route(apiPath(), namecardPublicCardRoutes());
    app.route(adminApiPath('/cards'), namecardModerationRoutes());
    app.route(apiPath(), namecardReactionRoutes());
    // 交换挂在社区交换区（`/api/community/exchange/...`），与契约里的路径叶子一致。
    app.route(communityApiPath(), namecardExchangeRoutes());
}
