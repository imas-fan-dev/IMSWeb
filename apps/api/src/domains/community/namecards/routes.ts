import type { ImsHonoApp } from "@/app";
import { namecardModerationRoutes } from "@/domains/community/namecards/moderation/routes";
import { namecardPublicCardRoutes } from "@/domains/community/namecards/public-cards/routes";
import { namecardReactionRoutes } from "@/domains/community/namecards/reactions/routes";
import { namecardSubmissionRoutes } from "@/domains/community/namecards/submissions/routes";

export function registerNamecardRoutes(app: ImsHonoApp): void {
    app.route("/api", namecardPublicCardRoutes());
    app.route("/api", namecardSubmissionRoutes());
    app.route("/api/admin/cards", namecardModerationRoutes());
    app.route("/api", namecardReactionRoutes());
}
