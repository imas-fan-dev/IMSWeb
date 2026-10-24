import { spawnSync } from "node:child_process"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { routeDescriptorsForTarget } from "../app/route-metadata.ts"

export function appPreviewWebOnlyRoutes() {
  return [
    "/admin",
    "/admin/*",
    ...routeDescriptorsForTarget("web")
      .filter(
        (route) =>
          route.targets.every((target) => target === "web") &&
          route.layout !== "admin" &&
          route.path &&
          !route.path.startsWith("admin/")
      )
      .flatMap((route) => [`/${route.path}`, `/${route.path}/`]),
  ]
}

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
  const target = process.argv[2] ?? "app"
  if (!["web", "app"].includes(target)) {
    throw new Error("Preview target must be web or app")
  }
  const result = spawnSync(
    "pnpm",
    ["--filter", "@imsweb/api", "run", "test:app-preview"],
    {
      // Windows exposes pnpm as a `pnpm.cmd` shim, which Node 22.13+ only
      // spawns through a shell.
      shell: process.platform === "win32",
      env: {
        ...process.env,
        IMS_E2E_PREVIEW_TARGET: target,
        IMS_APP_E2E_WEB_ONLY_ROUTES: JSON.stringify(
          target === "app" ? appPreviewWebOnlyRoutes() : []
        ),
        IMS_APP_E2E_SPA_ROUTES: JSON.stringify(
          target === "app" ? appPreviewSpaRoutes() : []
        ),
      },
      stdio: "inherit",
    }
  )
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}
