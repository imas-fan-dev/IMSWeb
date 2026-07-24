import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ActivityHighlights } from "~/pages/home/components/activity-highlights"
import { RandomIdol } from "~/pages/home/components/random-idol"
import { SiteSupport } from "~/pages/home/components/site-support"

function stubInformation(cards: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ cards }), {
      headers: { "content-type": "application/json" },
    })
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function HomeSections() {
  return (
    <>
      <ActivityHighlights />
      <RandomIdol />
      <SiteSupport />
    </>
  )
}

describe("home supporting sections", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("renders activity highlights only from the Information API", async () => {
    stubInformation([
      {
        id: "stored-activity-001",
        category: "activity",
        contentType: "external",
        title: "存储中的活动资讯",
        image: "/uploads/information/original/stored.png",
        link: "https://example.com/stored",
        updatedAt: "2026-07-24T00:00:00.000Z",
      },
    ])
    render(<HomeSections />)

    expect(
      screen.getByRole("region", { name: "活动资讯与同人活动" })
    ).toBeVisible()
    expect(
      await screen.findByRole("link", { name: /存储中的活动资讯/ })
    ).toHaveAttribute("href", "https://example.com/stored")
    expect(screen.queryByText("篠泽广研讨会")).not.toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: /雨云|云计算/ })).toHaveLength(3)
  })

  it("shows an empty state instead of code-backed activity fallback data", async () => {
    stubInformation([])
    render(<HomeSections />)

    expect(await screen.findByText("当前没有已发布的活动资讯。")).toBeVisible()
    expect(screen.queryByText("篠泽广研讨会")).not.toBeInTheDocument()
  })

  it("selects an idol from the migrated birthday dataset", async () => {
    stubInformation([])
    vi.spyOn(Math, "random").mockReturnValue(0)
    const user = userEvent.setup()
    render(<HomeSections />)

    await user.click(screen.getByRole("button", { name: "随机选择" }))

    expect(screen.getByRole("link", { name: "天海春香" })).toHaveAttribute(
      "href",
      "/wiki/story?agency=765PRO&idol=%E5%A4%A9%E6%B5%B7%E6%98%A5%E9%A6%99"
    )
  })
})
