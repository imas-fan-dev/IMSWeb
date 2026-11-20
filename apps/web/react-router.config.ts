import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { Config } from "@react-router/dev/config"

import { siteDiscoveryFiles, siteSeoOrigin } from "./app/lib/site-seo.ts"
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
  async buildEnd({ reactRouterConfig, viteConfig }) {
    if (isAppTarget) return
    const clientDir = resolve(
      viteConfig.root,
      reactRouterConfig.buildDirectory,
      "client"
    )
    const origin = siteSeoOrigin(viteConfig.env.VITE_IMS_PUBLIC_SITE_ORIGIN)
    await Promise.all(
      Object.entries(siteDiscoveryFiles(origin)).map(([file, content]) =>
        writeFile(resolve(clientDir, file), content)
      )
    )
  },
} satisfies Config
