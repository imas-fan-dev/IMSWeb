import type { RouteConfigEntry } from "@react-router/dev/routes"
import { describe, expect, it } from "vitest"

import {
  prerenderRoutesForTarget,
  routeDescriptorsForTarget,
  type RouteDescriptor,
} from "~/route-metadata"
import routes from "~/routes"

function joinPath(parent: string, child: string) {
  return [parent, child].filter(Boolean).join("/")
}

type ManifestLeaf = { path: string; file: string; id?: string }

function manifestLeaves(
  entries: readonly RouteConfigEntry[],
  parent = ""
): ManifestLeaf[] {
  return entries.flatMap((entry) => {
    const current =
      "path" in entry && entry.path ? joinPath(parent, entry.path) : parent
    return [
      ...(entry.file.startsWith("pages/")
        ? [
            {
              path: "index" in entry && entry.index ? current || "/" : current,
              file: entry.file,
              id: entry.id,
            },
          ]
        : []),
      ...("children" in entry && entry.children
        ? manifestLeaves(entry.children, current)
        : []),
    ]
  })
}

function descriptorLeaf(descriptor: RouteDescriptor) {
  const path = descriptor.index ? "" : (descriptor.path ?? "")
  return {
    path: descriptor.layout === "admin" ? joinPath("admin", path) : path || "/",
    file: descriptor.file,
    id: descriptor.id,
  }
}

function sortedLeaves(leaves: ReturnType<typeof manifestLeaves>) {
  return [...leaves].sort((left, right) =>
    `${left.path}:${left.file}`.localeCompare(`${right.path}:${right.file}`)
  )
}

function routeFile(path: string) {
  return manifestLeaves(routes).find((entry) => entry.path === path)?.file
}

describe("Web route metadata", () => {
  it("is the exact source of the typed Web manifest", () => {
    const manifest = sortedLeaves(manifestLeaves(routes))
    const descriptors = sortedLeaves(
      routeDescriptorsForTarget("web").map(descriptorLeaf)
    )

    expect(manifest).toEqual(descriptors)
    expect(manifest).toHaveLength(60)
  })

  it("registers every Web prerender and preserves the 30-document set", () => {
    const prerenders = prerenderRoutesForTarget("web")
    const manifest = manifestLeaves(routes)

    expect(new Set(prerenders).size).toBe(prerenders.length)
    expect(prerenders).toHaveLength(30)
    for (const prerender of prerenders) {
      const prerenderSegments = prerender.replace(/^\//, "").split("/")
      expect(
        manifest.some(({ path }) => {
          if (path === "/") return prerender === "/"
          const routeSegments = path.split("/")
          return (
            routeSegments.length === prerenderSegments.length &&
            routeSegments.every(
              (segment, index) =>
                segment.startsWith(":") || segment === prerenderSegments[index]
            )
          )
        })
      ).toBe(true)
    }
  })

  it("keeps Web exchange detail routes under the persistent map page", () => {
    const publicRoutes = routes[0]!.children!
    const map = publicRoutes.find(
      (entry) => entry.path === "community/exchange"
    )!
    expect(map.file).toBe(
      "pages/community/exchange/community-exchange-page.tsx"
    )
    expect(map.children?.map((entry) => entry.path).sort()).toEqual([
      "me",
      "offices/:officeSlug",
    ])
    expect(
      publicRoutes.some(
        (entry) => entry.path === "community/exchange/offices/:officeSlug"
      )
    ).toBe(false)
  })

  it("delivers community management only to the Web admin layout", () => {
    expect(routeFile("admin/community")).toBe("pages/admin/community/index.tsx")
    expect(
      routeDescriptorsForTarget("app").some(
        (entry) => entry.file === "pages/admin/community/index.tsx"
      )
    ).toBe(false)
  })

  it("uses the modern Wiki and story pages by default", () => {
    expect(routeFile("wiki")).toBe("pages/wiki/modern/index.tsx")
    expect(routeFile("story")).toBe("pages/wiki/modern/story-page.tsx")
  })

  it("delivers idol management only to the Web admin layout", () => {
    for (const page of ["agencies", "groups", "entries"]) {
      expect(routeFile(`admin/idols/${page}`)).toBe(
        `pages/admin/idols/${page}.tsx`
      )
    }
    expect(routeFile("admin/idols")).toBe("pages/admin/idols/index.tsx")
    expect(
      routeDescriptorsForTarget("app").some((entry) =>
        entry.file.startsWith("pages/admin/idols/")
      )
    ).toBe(false)
  })

  it("opens saved editorial drafts in a public-style preview page", () => {
    expect(routeFile("admin/events/:eventId/preview")).toBe(
      "pages/admin/events/preview-page.tsx"
    )
  })

  it("keeps explicit modern and classic compatibility routes", () => {
    expect(routeFile("wiki/modern")).toBe("pages/wiki/modern/index.tsx")
    expect(routeFile("story/modern")).toBe("pages/wiki/modern/story-page.tsx")
    expect(routeFile("wiki/classic")).toBe("pages/wiki/classic/index.tsx")
    expect(routeFile("story/classic")).toBe(
      "pages/wiki/classic/classic-story-page.tsx"
    )
  })
})
