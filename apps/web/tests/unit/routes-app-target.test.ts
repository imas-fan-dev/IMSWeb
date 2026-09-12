import type { RouteConfigEntry } from "@react-router/dev/routes"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  prerenderRoutesForTarget,
  routeDescriptorsForTarget,
} from "~/route-metadata"

type ManifestLeaf = { path: string; file: string; id?: string }

function joinPath(parent: string, child: string) {
  return [parent, child].filter(Boolean).join("/")
}

function routeLeaves(
  entries: readonly RouteConfigEntry[],
  parent = ""
): ManifestLeaf[] {
  return entries.flatMap((entry) => {
    const current =
      "path" in entry && entry.path ? joinPath(parent, entry.path) : parent
    if ("children" in entry && entry.children) {
      return routeLeaves(entry.children, current)
    }
    return [
      {
        path: "index" in entry && entry.index ? current || "/" : current,
        file: entry.file,
        id: entry.id,
      },
    ]
  })
}

function descriptorLeaf(
  descriptor: ReturnType<typeof routeDescriptorsForTarget>[number]
): ManifestLeaf {
  const path = descriptor.index ? "" : (descriptor.path ?? "")
  return {
    path: descriptor.layout === "admin" ? joinPath("admin", path) : path || "/",
    file: descriptor.file,
    id: descriptor.id,
  }
}

function sortedLeaves(leaves: readonly ManifestLeaf[]) {
  return [...leaves].sort((left, right) =>
    `${left.path}:${left.file}`.localeCompare(`${right.path}:${right.file}`)
  )
}

function routeFile(entries: readonly RouteConfigEntry[], path: string) {
  return routeLeaves(entries).find((entry) => entry.path === path)?.file
}

describe("app target routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("derives the complete App manifest from target metadata", async () => {
    vi.stubEnv("VITE_IMS_APP_TARGET", "app")
    vi.resetModules()

    const { default: routes } = await import("~/routes")
    const leaves = routeLeaves(routes)

    expect(leaves).toHaveLength(31)
    expect(sortedLeaves(leaves)).toEqual(
      sortedLeaves(routeDescriptorsForTarget("app").map(descriptorLeaf))
    )
    expect(prerenderRoutesForTarget("app")).toHaveLength(28)
    expect(routeFile(routes, "apps")).toBe("pages/apps/index.tsx")
    expect(routeFile(routes, "account/me/:section")).toBe(
      "pages/account/me/account-me-section-page.tsx"
    )
    expect(routeFile(routes, "wiki")).toBe("pages/wiki/modern/index.tsx")
    expect(routeFile(routes, "story")).toBe("pages/wiki/modern/story-page.tsx")
    expect(routeFile(routes, "wiki/classic")).toBeUndefined()
    expect(routeFile(routes, "story/classic")).toBeUndefined()
  })

  it("keeps App-only routes out of the Web manifest", async () => {
    vi.stubEnv("VITE_IMS_APP_TARGET", "web")
    vi.resetModules()

    const { default: routes } = await import("~/routes")

    expect(routeFile(routes, "apps")).toBeUndefined()
    expect(routeFile(routes, "account/me/:section")).toBeUndefined()
  })
})
