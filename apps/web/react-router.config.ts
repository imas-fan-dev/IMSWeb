import type { Config } from "@react-router/dev/config"

export default {
  ssr: false,
  // Dynamic Chronicle and admin routes use the SPA fallback. API and media
  // routes stay outside this list and continue to be routed to Hono.
  prerender: [
    "/",
    "/about",
    "/events",
    "/recommendations",
    "/live",
    "/community",
    "/works",
    "/wiki",
    "/wiki/classic",
    "/story",
    "/story/classic",
  ],
} satisfies Config
