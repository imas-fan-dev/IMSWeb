import {
    apiPath,
    platformAuthPath,
    siteContentPath,
    wikiPath,
} from "@imsweb/contracts/paths";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId, type RequestIdVariables } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { jsonBodyLimit } from "@/middleware/json-body-limit";
import {
    isDynamicBusinessRequest,
    requestRateLimit,
    validatedRequestPath,
} from "@/middleware/rate-limit";
import type {
    RuntimeServices,
    ResolveServices,
} from "@/ports/runtime-services";
import type { BackofficeJwtClaims, PlatformJwtClaims } from "@/ports/security";
import type { PlatformAccountWithProfile } from "@/ports/repositories";
import { requestCompletionLogger } from "@/middleware/request-observability";
import { isSensitiveRequestPath } from "@/middleware/static-path-policy";
import { registerAuditRoutes } from "@/domains/admin/audit/routes";
import { registerAdminAccountRoutes } from "@/domains/admin/admin-accounts/routes";
import { registerAboutRoutes } from "@/domains/content/about/routes";
import { registerBackofficeAuthRoutes } from "@/domains/admin/backoffice-auth/routes";
import { registerBrandAssetRoutes } from "@/domains/content/brand-assets/routes";
import { registerChronicleRoutes } from "@/domains/content/chronicle/routes";
import { registerEventRoutes } from "@/domains/content/events/routes";
import { registerFudabaRoutes } from "@/domains/community/fudaba/routes";
import { registerInformationRoutes } from "@/domains/content/information/routes";
import { registerHomepageLinkRoutes } from "@/domains/content/homepage-links/routes";
import { registerLiveScheduleRoutes } from "@/domains/content/live-schedule/routes";
import { registerMediaRoutes } from "@/domains/delivery/media/routes";
import { registerNamecardRoutes } from "@/domains/community/namecards/routes";
import { registerNewsRoutes } from "@/domains/content/news/routes";
import { registerProducerMapRoutes } from "@/domains/content/producer-map/routes";
import { registerPlatformAccountSecurityRoutes } from "@/domains/identity/platform-account-security/routes";
import { registerPlatformAuthRoutes } from "@/domains/identity/platform-auth/routes";
import { registerPlatformProfileRoutes } from "@/domains/identity/platform-profile/routes";
import { registerSiteRoutes } from "@/domains/delivery/site/routes";
import { registerSitePackageRoutes } from "@/domains/delivery/site-packages/routes";
import { registerWikiRoutes } from "@/domains/content/wiki/routes";

export interface AppEnvironment {
    Bindings: object;
    Variables: RequestIdVariables & {
        services: RuntimeServices;
        backofficeUser?: BackofficeJwtClaims;
        backofficeAuthSource?: "authorization" | "cookie" | "legacy-cookie";
        platformUser?: PlatformJwtClaims;
        platformAccount?: PlatformAccountWithProfile;
        platformAuthSource?: "authorization" | "cookie";
    };
}

export type ImsHonoApp = Hono<AppEnvironment>;

function allowedCorsOrigin(origin: string): string | null {
    try {
        const parsed = new URL(origin);
        const localHost = ["127.0.0.1", "::1", "localhost"].includes(
            parsed.hostname,
        );
        if (localHost && ["http:", "https:"].includes(parsed.protocol)) {
            return origin;
        }
        // The packaged mobile client. Tauri serves the bundle from a custom
        // scheme on Apple platforms and from tauri.localhost elsewhere; neither
        // shape matches the loopback rule above.
        //
        // No credentials are granted to these origins: the app authenticates
        // with a Bearer token, so cookies never need to cross the boundary.
        const tauriScheme =
            parsed.protocol === "tauri:" && parsed.hostname === "localhost";
        const tauriHost =
            parsed.hostname === "tauri.localhost" &&
            ["http:", "https:"].includes(parsed.protocol);
        return tauriScheme || tauriHost ? origin : null;
    } catch {
        return null;
    }
}

export interface CreateHonoAppOptions {
    requestLogging?: boolean;
}

export function createHonoApp<
    Bindings extends object = Record<string, unknown>,
>(
    resolveServices: ResolveServices<Bindings>,
    options: CreateHonoAppOptions = {},
): ImsHonoApp {
    const app = new Hono<AppEnvironment>();

    app.use("*", requestId({ limitLength: 128 }));
    app.use("*", requestCompletionLogger(options.requestLogging === true));
    app.use("*", async (c, next) => {
        if (
            c.req.path === apiPath("/health/live") ||
            c.req.path === wikiPath("/test")
        ) {
            return next();
        }
        let runtime: RuntimeServices;
        try {
            runtime = await resolveServices(c.env as Bindings);
        } catch (error) {
            if (c.req.path === apiPath("/health/ready")) {
                if (options.requestLogging) {
                    console.warn(
                        JSON.stringify({
                            event: "health_readiness_failed",
                            requestId: c.get("requestId"),
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        }),
                    );
                }
                return c.json({ status: "unavailable" }, 503);
            }
            throw error;
        }
        c.set("services", runtime);
        await next();
    });

    app.use("*", async (c, next) => {
        let rawPath: string;
        try {
            rawPath = new URL(c.req.raw.url).pathname;
        } catch {
            return c.text("Forbidden", 403);
        }
        if (isSensitiveRequestPath(rawPath)) {
            return c.text("Forbidden", 403);
        }
        await next();
    });

    // Path-less middleware runs on every route. Origins are not wildcarded:
    // allowedCorsOrigin echoes back only loopback and packaged-client origins,
    // and no credentials are granted because the app carries a bearer token.
    app.use(cors({ origin: allowedCorsOrigin }));
    app.use(
        "*",
        secureHeaders({
            crossOriginEmbedderPolicy: false,
            crossOriginResourcePolicy: "cross-origin",
            strictTransportSecurity: "max-age=31536000; includeSubDomains",
            xFrameOptions: false,
        }),
    );
    app.use("*", async (c, next) => {
        await next();
        let pathname = "";
        try {
            pathname = new URL(c.req.raw.url).pathname;
        } catch {
            pathname = "";
        }
        if (
            pathname !== siteContentPath() &&
            !pathname.startsWith(siteContentPath("/")) &&
            !c.res.headers.has("X-Frame-Options")
        ) {
            c.header("X-Frame-Options", "SAMEORIGIN");
        }
    });
    app.use(platformAuthPath("/*"), async (c, next) => {
        await next();
        c.header("Cache-Control", "private, no-store");
        c.header("Vary", "Authorization, Cookie", { append: true });
    });
    app.use("*", requestRateLimit());
    app.use("*", jsonBodyLimit());
    app.use("*", async (c, next) => {
        const pathname = validatedRequestPath(c);
        const runtime = c.get("services");
        if (isDynamicBusinessRequest(c.req.method, pathname)) {
            if (runtime.objectCleanup) {
                await runtime.objectCleanup.run();
            } else {
                if (runtime.compensation && runtime.storage) {
                    await runtime.compensation
                        .run(runtime.storage, 3)
                        .catch((error) => console.warn(error));
                }
                await runtime.objectDeletions
                    ?.run(3)
                    .catch((error) => console.warn(error));
            }
        }
        await next();
    });

    app.get(apiPath("/health/live"), (c) => c.json({ status: "ok" }));
    app.get(apiPath("/health/ready"), async (c) => {
        const health = c.get("services").health;
        if (!health) return c.json({ status: "unavailable" }, 503);
        try {
            await health.check();
            return c.json({ status: "ok" });
        } catch (error) {
            if (options.requestLogging) {
                console.warn(
                    JSON.stringify({
                        event: "health_readiness_failed",
                        requestId: c.get("requestId"),
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    }),
                );
            }
            return c.json({ status: "unavailable" }, 503);
        }
    });

    // Kept as a compatibility probe for existing clients.
    app.get(wikiPath("/test"), (c) => c.json({ status: "ok" }));

    registerAboutRoutes(app);
    registerProducerMapRoutes(app);
    registerBrandAssetRoutes(app);
    registerBackofficeAuthRoutes(app);
    registerPlatformAuthRoutes(app);
    registerPlatformProfileRoutes(app);
    // After the profile domain: its `/me/*` private-response middleware must be
    // registered before these routes match.
    registerPlatformAccountSecurityRoutes(app);
    registerAdminAccountRoutes(app);
    registerNamecardRoutes(app);
    registerEventRoutes(app);
    registerFudabaRoutes(app);
    registerNewsRoutes(app);
    registerHomepageLinkRoutes(app);
    registerInformationRoutes(app);
    registerLiveScheduleRoutes(app);
    registerMediaRoutes(app);
    registerAuditRoutes(app);
    registerChronicleRoutes(app);
    registerSitePackageRoutes(app);
    registerSiteRoutes(app);
    registerWikiRoutes(app, (c) => c.get("services"));

    app.notFound(async (c) => {
        const assets = c.get("services").staticAssets;
        return assets ? assets.fetch(c.req.raw) : c.text("Not Found", 404);
    });

    app.onError((error, c) => {
        const candidate = Number(
            (error as Error & { status?: unknown }).status,
        );
        const status =
            Number.isInteger(candidate) && candidate >= 400 && candidate <= 599
                ? candidate
                : 500;
        if (status >= 500 && options.requestLogging) {
            console.error(
                JSON.stringify({
                    event: "http_request_error",
                    requestId: c.get("requestId"),
                    method: c.req.method,
                    path: c.req.path,
                    status,
                    error: error.message,
                    stack: error.stack,
                }),
            );
        }
        return new Response(
            JSON.stringify({
                error: status >= 500 ? "Internal server error" : error.message,
            }),
            {
                status,
                headers: { "Content-Type": "application/json; charset=UTF-8" },
            },
        );
    });

    return app;
}
