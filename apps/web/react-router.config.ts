import type { Config } from "@react-router/dev/config"

import { prerenderRoutesForTarget } from "./app/route-metadata.ts"

const isAppTarget = process.env.VITE_IMS_APP_TARGET === "app"

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
  prerender: prerenderRoutesForTarget(isAppTarget ? "app" : "web"),
} satisfies Config
