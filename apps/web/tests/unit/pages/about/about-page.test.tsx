import { render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import About from "~/pages/about/about-page"
import type { AboutPageContent } from "~/shared/api"
import { seriesWallItems } from "~/shared/series-wall"

vi.mock("~/components/shared/series-icon-background", () => ({
  SeriesIconBackground: () => <div data-testid="series-icon-background" />,
}))

function aboutContent(): AboutPageContent {
  return {
    version: 1,
    siteName: "测试制作人交流站",
    siteNameEn: "A place for Producers.",
    tagline: "一起维护可靠的偶像大师中文资料。",
    heroImageUrl: "/brand/about/gakuen-arisa.png",
    heroImageAlt: "测试角色全身立绘",
    heroImageScale: 112,
    heroImageOffsetX: -8,
    heroImageOffsetY: 4,
    accentColorStart: "#B4E04B",
    accentColorEnd: "#E6F9E5",
    welcome: "欢迎全世界的制作人！",
    manifesto: ["为了 Top Idol 之名", "继续前进吧"],
    sinceYear: 2026,
    overviewTitle: "测试概要",
    overview: ["第一段站点介绍。", "第二段站点介绍。"],
    groups: [
      {
        id: "creators",
        title: "创始人",
        subtitle: "Creator",
        people: [
          {
            id: "producer-a",
            name: "制作人A",
            role: "站长",
            description: "维护站点内容。",
            since: "Since 2026",
            profileUrl: "https://example.com/producer-a",
            avatarUrl: "/brand/about/staff/producer-a.webp",
          },
        ],
      },
      {
        id: "future-team",
        title: "未来成员",
        subtitle: "Future Team",
        people: [],
      },
    ],
    updatedAt: "2026-07-25T00:00:00.000Z",
  }
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  })
}

describe("About page", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders API-configured identity, overview, and people groups", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(aboutContent()))
    vi.stubGlobal("fetch", fetchMock)

    const { container } = render(<About />)

    const pageTitle = await screen.findByRole("heading", {
      name: "测试制作人交流站",
    })
    expect(pageTitle).toBeVisible()
    const hero = pageTitle.closest("section")
    expect(hero).not.toBeNull()
    expect(
      within(hero as HTMLElement).getByRole("heading", { name: "测试概要" })
    ).toBeVisible()
    expect(within(hero as HTMLElement).getByText("Since2026")).toBeVisible()
    expect(screen.getByText("第一段站点介绍。")).toBeVisible()
    expect(screen.getByRole("heading", { name: "创始人" })).toBeVisible()
    expect(screen.getByText("制作人A")).toBeVisible()
    expect(screen.getByAltText("测试角色全身立绘")).toHaveAttribute(
      "src",
      "/brand/about/gakuen-arisa.png"
    )
    expect(screen.getByAltText("测试角色全身立绘")).toHaveStyle({
      transform: "translate(-8%, 4%) scale(1.12)",
    })
    expect(screen.getByAltText("制作人A的头像")).toHaveAttribute(
      "src",
      "/brand/about/staff/producer-a.webp"
    )
    expect(screen.getByRole("link", { name: "访问个人主页" })).toHaveAttribute(
      "href",
      "https://example.com/producer-a"
    )
    expect(screen.getByText("本分组名单暂未公开。")).toBeVisible()
    expect(screen.getByTestId("series-icon-background")).toBeVisible()
    expect(
      screen
        .getByTestId("series-accent-strip")
        .querySelectorAll("[data-series-accent]")
    ).toHaveLength(seriesWallItems.length)
    expect(container.querySelector("main#main-content")).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("offers a retry when dynamic content cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))

    render(<About />)

    expect(await screen.findByText("关于本站暂时无法显示")).toBeVisible()
    expect(screen.getByRole("button", { name: "重新加载" })).toBeVisible()
  })
})
