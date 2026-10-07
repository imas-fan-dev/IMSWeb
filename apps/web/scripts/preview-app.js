import { spawnSync } from "node:child_process"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { routeDescriptorsForTarget } from "../app/route-metadata.ts"

export function appPreviewSpaRoutes() {
  return routeDescriptorsForTarget("app")
    .filter(
      (route) =>
        route.path &&
        (route.delivery === "spa" ||
          (route.delivery === "none" &&
            route.targets.every((target) => target === "app")))
    )
    .map((route) => route.path)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
  const result = spawnSync(
    command,
    ["--filter", "@imsweb/api", "run", "test:app-preview"],
    {
      env: {
        ...process.env,
        IMS_APP_E2E_SPA_ROUTES: JSON.stringify(appPreviewSpaRoutes()),
      },
      stdio: "inherit",
    }
  )
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}
