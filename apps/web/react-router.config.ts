import type { Config } from "@react-router/dev/config"

const isAppTarget = process.env.VITE_IMS_APP_TARGET === "app"
const standalonePrerenderRoutes = isAppTarget
  ? []
  : ["/wiki/classic", "/story/classic"]

export default {
  ssr: false,
  buildDirectory: isAppTarget ? "build-app" : "build",
  future: {
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_viteEnvironmentApi: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
  // Dynamic Chronicle and admin routes use the SPA fallback. API and media
  // routes stay outside this list and continue to be routed to Hono.
  prerender: [
    "/",
    "/about",
    "/events",
    "/recommendations",
    "/live",
    "/community",
    "/account/login",
    "/account/register",
    // Both of these are reachable by typing the URL or from a bookmark, so they
    // need a real document. Without one the Hono policy answers 404 and only
    // client-side navigation works. Every entry here must also be registered in
    // apps/api PRERENDERED_ROUTES or [FRT-06] fails.
    "/account/password-reset",
    "/account/security",
    "/community/exchange",
    "/community/cards",
    "/producer-map",
    "/tier-list",
    "/works",
    "/works/765",
    "/works/cg",
    "/works/ml",
    "/works/sidem",
    "/works/sc",
    "/works/gakuen",
    "/works/games",
    "/works/wows",
    "/wiki",
    "/wiki/modern",
    "/story",
    "/story/modern",
    "/chronicle",
    ...standalonePrerenderRoutes,
  ],
} satisfies Config
