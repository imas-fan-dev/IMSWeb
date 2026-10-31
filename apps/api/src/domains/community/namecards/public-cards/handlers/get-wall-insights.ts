import type { AppEnvironment } from "@/app";
import type { WallInsights } from "@imsweb/contracts/namecards";
import { services } from "@/middleware/hono-context";
import type { Context } from "hono";

/**
 * 名片墙顶部的临时面板：无主名片总数、两类待审量、贡献榜前五与当前用户的名次。
 * 没登录也要能看，所以整条路由是可选鉴权。
 */
export async function handleGetWallInsights(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const repository = services(c).fudaba;
    if (!repository) {
        return c.json({
            guestTotal: 0,
            ownerless: 0,
            ownerlessMissingSeries: 0,
            claimed: 0,
            claimsPending: 0,
            supplemented: 0,
            supplementsPending: 0,
            contributors: [],
            viewer: null,
        } satisfies WallInsights);
    }
    const insights = await repository.wallInsights(
        c.get("platformUser")?.id ?? null,
    );
    return c.json({
        guestTotal: insights.guest_total,
        ownerless: insights.ownerless,
        ownerlessMissingSeries: insights.ownerless_missing_series,
        claimed: insights.claimed,
        claimsPending: insights.claims_pending,
        supplemented: insights.supplemented,
        supplementsPending: insights.supplements_pending,
        contributors: insights.contributors.map((contributor) => ({
            accountId: contributor.account_id,
            displayName: contributor.display_name,
            points: contributor.points,
            cards: contributor.cards,
        })),
        viewer: insights.viewer
            ? {
                  accountId: insights.viewer.account_id,
                  displayName: insights.viewer.display_name,
                  points: insights.viewer.points,
                  rank: insights.viewer.rank,
              }
            : null,
    } satisfies WallInsights);
}
