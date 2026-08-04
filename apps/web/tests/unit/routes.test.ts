import { describe, expect, it } from "vitest"

import routes from "~/routes"

function routeFile(path: string) {
  for (const route of routes) {
    if (route.path === path) return route.file
    if ("children" in route) {
      const child = route.children.find((entry) => entry.path === path)
      if (child) return child.file
    }
  }
  return undefined
}

describe("public route defaults", () => {
  it("uses the modern Wiki and story pages by default", () => {
    expect(routeFile("wiki")).toBe("pages/wiki/modern/wiki-index-page.tsx")
    expect(routeFile("story")).toBe("pages/wiki/modern/story-page.tsx")
  })

  it("keeps explicit modern and classic compatibility routes", () => {
    expect(routeFile("wiki/modern")).toBe(
      "pages/wiki/modern/wiki-index-page.tsx"
    )
    expect(routeFile("story/modern")).toBe("pages/wiki/modern/story-page.tsx")
    expect(routeFile("wiki/classic")).toBe(
      "pages/wiki/classic/classic-wiki-page.tsx"
    )
    expect(routeFile("story/classic")).toBe(
      "pages/wiki/classic/classic-story-page.tsx"
    )
  })
})
