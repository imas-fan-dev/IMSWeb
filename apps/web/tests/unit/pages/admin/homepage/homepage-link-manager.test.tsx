import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { HomepageLinkManager } from "~/pages/admin/homepage/homepage-link-manager"

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  })
}

describe("HomepageLinkManager", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("loads each homepage section and connects a row to the editor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
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
              support: [
                {
                  id: "support-cloud",
                  section: "support",
                  title: "计算服务",
                  description: "站点支持",
                  href: "https://example.test/",
                  icon: "external-link",
                  accent: "info",
                  displayOrder: 0,
                },
              ],
            },
          })
        )
      )
    )
    vi.stubGlobal("scrollTo", vi.fn())
    const user = userEvent.setup()

    render(<HomepageLinkManager />)

    expect(await screen.findByText("活动中心")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "拖动排序：活动中心" })
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "编辑" }))
    expect(screen.getByLabelText("标题")).toHaveValue("活动中心")
    expect(screen.getByLabelText("链接")).toHaveValue("/events")

    await user.click(screen.getByRole("tab", { name: "网站支持" }))
    expect(await screen.findByText("计算服务")).toBeVisible()
    expect(screen.getByLabelText("标题")).toHaveValue("")
  })
})
