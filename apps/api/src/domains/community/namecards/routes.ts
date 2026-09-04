import { adminApiPath, apiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from "@/app";
import { namecardModerationRoutes } from "@/domains/community/namecards/moderation/routes";
import { namecardPublicCardRoutes } from "@/domains/community/namecards/public-cards/routes";
import { namecardReactionRoutes } from "@/domains/community/namecards/reactions/routes";

export function registerNamecardRoutes(app: ImsHonoApp): void {
    app.route(apiPath(), namecardPublicCardRoutes());
    app.route(adminApiPath('/cards'), namecardModerationRoutes());
    app.route(apiPath(), namecardReactionRoutes());
}
