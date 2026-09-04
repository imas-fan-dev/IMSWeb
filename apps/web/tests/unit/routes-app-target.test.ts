import { afterEach, describe, expect, it, vi } from "vitest"

function routeFile(
  routes: Awaited<typeof import("~/routes")>["default"],
  path: string
) {
  for (const route of routes) {
    if ("path" in route && route.path === path) return route.file
    if ("children" in route) {
      const child = route.children.find((entry) => entry.path === path)
      if (child) return child.file
    }
  }
  return undefined
}

describe("app target routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("excludes classic Wiki pages from the app manifest", async () => {
    vi.stubEnv("VITE_IMS_APP_TARGET", "app")
    vi.resetModules()

    const { default: routes } = await import("~/routes")

    expect(routeFile(routes, "apps")).toBe("pages/apps/index.tsx")
    expect(routeFile(routes, "account/me/:section")).toBe(
      "pages/account/me/account-me-section-page.tsx"
    )
    expect(routeFile(routes, "wiki")).toBe("pages/wiki/modern/index.tsx")
    expect(routeFile(routes, "story")).toBe("pages/wiki/modern/story-page.tsx")
    expect(routeFile(routes, "wiki/classic")).toBeUndefined()
    expect(routeFile(routes, "story/classic")).toBeUndefined()
  })

  it("keeps the Apps directory out of the Web manifest", async () => {
    vi.stubEnv("VITE_IMS_APP_TARGET", "web")
    vi.resetModules()

    const { default: routes } = await import("~/routes")

    expect(routeFile(routes, "apps")).toBeUndefined()
    expect(routeFile(routes, "account/me/:section")).toBeUndefined()
  })
})
