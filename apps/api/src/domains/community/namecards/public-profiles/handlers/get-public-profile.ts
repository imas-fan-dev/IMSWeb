import type { AppEnvironment } from "@/app";
import { platformProfileView } from "@/domains/identity/platform-profile/profile-view";
import { services } from "@/middleware/hono-context";
import type { ValidatedRequestContext } from "@/middleware/request-validation";
import type { Context } from "hono";
import type { PublicProfileResponse } from "@/domains/community/namecards/response";

/**
 * 某人公开的主页资料：昵称、头像、常驻城市与简介。
 * 帐号不存在或已注销时一律 404，避免把「有资料但已删除」暴露出去。
 */
export async function handleGetPublicProfile(
    c: ValidatedRequestContext<AppEnvironment, "param", { accountId: string }>,
): Promise<Response> {
    const { accountId } = c.req.valid("param");
    const repository = services(c).namecards;
    if (!repository) {
        return c.json({ success: false, code: "PUBLIC_PROFILE_UNAVAILABLE" }, 404);
    }
    const profile = await repository.findPublicProfile(accountId);
    if (!profile) {
        return c.json({ success: false, code: "PUBLIC_PROFILE_UNAVAILABLE" }, 404);
    }
    const view = await platformProfileView(
        {
            account_id: profile.account_id,
            display_name: profile.display_name,
            avatar_object_key: profile.avatar_object_key,
            avatar_external_url: profile.avatar_external_url,
            home_city: profile.home_city,
            bio: profile.bio,
            updated_at: profile.updated_at,
        },
        services(c).storage,
    );
    const body: PublicProfileResponse = {
        accountId: profile.account_id,
        uid: profile.uid,
        pageSlug: profile.page_slug,
        displayName: profile.display_name,
        avatarUrl: view.avatarUrl,
        homeCity: profile.home_city,
        bio: profile.bio,
    };
    return c.json(body);
}
