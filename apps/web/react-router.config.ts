import type { Config } from "@react-router/dev/config"

export default {
  ssr: false,
  // Dynamic Chronicle and admin routes use the SPA fallback. Hono-owned routes
  // stay outside this list and must continue to be routed to Hono at the edge.
  prerender: ["/", "/about", "/events", "/live", "/community", "/works"],
} satisfies Config
