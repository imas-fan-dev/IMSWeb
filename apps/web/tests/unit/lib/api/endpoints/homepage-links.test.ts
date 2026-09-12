import { afterEach, describe, expect, it, vi } from "vitest"

import { getAdminHomepageLinks, getHomepageLinks } from "~/lib/api"

describe("homepage link endpoints", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("keeps protected and public error contracts separate", async () => {
    const error = { message: "无权限（仅op可访问）" }
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json(error, { status: 403 }))
        .mockResolvedValueOnce(Response.json(error, { status: 403 }))
    )

    await expect(getAdminHomepageLinks().send()).rejects.toMatchObject({
      kind: "http",
      status: 403,
      payload: error,
    })
    await expect(getHomepageLinks().send()).rejects.toMatchObject({
      kind: "contract",
      code: "CONTRACT_VIOLATION",
      status: 403,
    })
  })

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
