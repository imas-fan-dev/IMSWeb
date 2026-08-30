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
