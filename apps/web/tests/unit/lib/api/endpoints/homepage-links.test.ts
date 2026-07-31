import { afterEach, describe, expect, it, vi } from "vitest"

import { getHomepageLinks } from "~/lib/api"

describe("homepage link endpoints", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("parses ordered database-backed homepage sections", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              sections: {
                navigation: [
                  {
                    id: "navigation-events",
                    section: "navigation",
                    title: "活动中心",
                    description: "浏览活动",
                    href: "/events",
                    icon: "calendar",
                    accent: "franchise-765",
                    displayOrder: 0,
                  },
                ],
                friend: [],
                support: [],
              },
            }),
            { headers: { "content-type": "application/json" } }
          )
        )
      )
    )

    await expect(getHomepageLinks().send()).resolves.toMatchObject({
      sections: {
        navigation: [{ id: "navigation-events", href: "/events" }],
      },
    })
  })
})
