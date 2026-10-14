import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { HomePortal } from "~/pages/home/index"

vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))
vi.mock("~/pages/home/hooks/use-homepage-links", () => ({
  HomepageLinksProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock("~/pages/home/components/activity-highlights", () => ({
  ActivityHighlights: () => <div>活动资讯占位</div>,
}))
vi.mock("~/pages/home/components/app-home-links-footer", () => ({
  AppHomeLinksFooter: () => <div>紧凑社区与支持入口</div>,
}))
vi.mock("~/pages/home/components/birthday-calendar", () => ({
  BirthdayCalendar: () => <div>生日月历占位</div>,
}))
vi.mock("~/pages/home/components/home-browser-brand", () => ({
  HomeBrowserBrand: () => <div>浏览器品牌占位</div>,
}))
vi.mock("~/pages/home/components/home-feed", () => ({
  HomeFeed: () => <div>首页动态占位</div>,
}))
vi.mock("~/pages/home/components/home-hero", () => ({
  SeriesWall: () => <div>系列入口占位</div>,
  TodayBirthdayNotice: () => <div>今日生日占位</div>,
}))
vi.mock("~/pages/home/components/home-navigation", () => ({
  PortalDirectory: () => <div>重复站点目录</div>,
  FriendLinks: () => <div>桌面友情链接</div>,
}))
vi.mock("~/pages/home/components/random-idol", () => ({
  RandomIdol: () => <div>随机偶像占位</div>,
}))
vi.mock("~/pages/home/components/site-support", () => ({
  SiteSupport: () => <div>桌面网站支持</div>,
}))

describe("HomePortal in the App target", () => {
  it("omits the repeated directory and uses the compact tail links", () => {
    render(<HomePortal />)

    expect(screen.queryByText("重复站点目录")).not.toBeInTheDocument()
    expect(screen.queryByText("桌面友情链接")).not.toBeInTheDocument()
    expect(screen.queryByText("桌面网站支持")).not.toBeInTheDocument()
    expect(screen.getByText("紧凑社区与支持入口")).toBeVisible()
  })
})
