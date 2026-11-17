import type { RouteConfig, RouteConfigEntry } from "@react-router/dev/routes"

import {
  routeDescriptorsForTarget,
  type FrontendTarget,
  type RouteDescriptor,
  type RouteLayout,
} from "./route-metadata.ts"

const isAppTarget = import.meta.env.VITE_IMS_APP_TARGET === "app"
const target: FrontendTarget = isAppTarget ? "app" : "web"

function routeEntry(descriptor: RouteDescriptor): RouteConfigEntry {
  const identity = descriptor.id ? { id: descriptor.id } : {}
  if (descriptor.index) {
    return { ...identity, index: true, file: descriptor.file }
  }
  if (!descriptor.path) {
    throw new Error(`Non-index route ${descriptor.file} is missing its path`)
  }
  return { ...identity, path: descriptor.path, file: descriptor.file }
}

function entriesFor(layout: RouteLayout) {
  const entries = routeDescriptorsForTarget(target)
    .filter((descriptor) => descriptor.layout === layout)
    .map(routeEntry)
  if (target !== "web" || layout !== "public") return entries
  const mapPath = "community/exchange"
  const children = entries.filter((entry) =>
    entry.path?.startsWith(`${mapPath}/offices/`)
  )
  return entries
    .filter((entry) => !children.includes(entry))
    .map((entry) =>
      entry.path === mapPath
        ? {
            ...entry,
            children: children.map((child) => ({
              ...child,
              path: child.path!.slice(mapPath.length + 1),
            })),
          }
        : entry
    )
}

export default [
  {
    file: isAppTarget ? "layouts/app-layout.tsx" : "layouts/public-layout.tsx",
    children: entriesFor("public"),
  },
  ...entriesFor("standalone"),
  ...(isAppTarget
    ? []
    : [
        {
          path: "admin",
          file: "layouts/admin-layout.tsx",
          children: entriesFor("admin"),
        },
      ]),
] satisfies RouteConfig
