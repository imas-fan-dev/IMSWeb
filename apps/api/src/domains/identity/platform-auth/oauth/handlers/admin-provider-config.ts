import type { Context } from "hono";
import type { AppEnvironment } from "@/app";
import { parsePlatformOAuthProviderCode } from "@/domains/identity/platform-auth/oauth/request";
import { services } from "@/middleware/hono-context";
import type { ValidatedRequestContext } from "@/middleware/request-validation";
import type { PlatformOAuthProviderUpdateInput } from "@/ports/oauth";
import { messageFromError, statusFromError } from "@/utils/http/error-response";

function oauthClient(c: Context<AppEnvironment>) {
    const client = services(c).platformOAuth;
    if (!client) throw new Error("OAuth service unavailable");
    return client;
}

export async function handleGetAdminPlatformOAuthProviders(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const providers = await oauthClient(c).listProviderSettings();
    c.header("Cache-Control", "private, no-store");
    return c.json({ success: true, providers });
}

export async function handleUpdateAdminPlatformOAuthProvider(
    c: ValidatedRequestContext<
        AppEnvironment,
        "json",
        Omit<PlatformOAuthProviderUpdateInput, "code">
    >,
): Promise<Response> {
    const code = parsePlatformOAuthProviderCode(c.req.param("provider"));
    const input = c.req.valid("json");
    try {
        const result = await oauthClient(c).updateProvider({ ...input, code });
        if (result.status === "not-found") {
            return c.json(
                { success: false, message: "OAuth provider 不存在" },
                404,
            );
        }
        if (result.status === "conflict") {
            return c.json(
                {
                    success: false,
                    code: "REVISION_CONFLICT",
                    provider: result.provider,
                },
                409,
            );
        }
        c.header("Cache-Control", "private, no-store");
        return c.json({ success: true, provider: result.provider });
    } catch (error) {
        const status = statusFromError(error);
        return c.json(
            {
                success: false,
                message:
                    status >= 500
                        ? "OAuth 配置保存失败"
                        : messageFromError(error),
            },
            status >= 500 ? 500 : 400,
        );
    }
}
