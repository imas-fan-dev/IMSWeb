import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { RecommendationsCenter } from "~/pages/recommendations/index"

const feed = vi.hoisted(() => ({
  refresh: vi.fn(),
  loadFirstPage: vi.fn(),
  loadMore: vi.fn(),
}))

vi.mock("~/lib/app-target", () => ({
  IS_APP_TARGET: true,
  APP_STICKY_HEADER_OFFSET: "top-[var(--app-header-inset)]",
  APP_FLOATING_CONTROL_OFFSET: "bottom-[var(--app-floating-bottom)]",
  VIEWPORT_CONTENT: "width=device-width, initial-scale=1, viewport-fit=cover",
}))
vi.mock("~/pages/recommendations/hooks/use-recommendations-feed", () => ({
  useRecommendationsFeed: () => ({
    phase: "ready",
    items: [
      {
        id: "1",
        title: "测试推荐",
        thumbnail: null,
        content: "https://example.com/recommendations/1",
        date: "2026-07-24T00:00:00.000Z",
      },
    ],
    pageInfo: {
      nextCursor: null,
      hasNextPage: false,
      snapshotAt: "1",
    },
    loadingMore: false,
    refreshing: false,
    error: null,
    loadMoreError: null,
    refreshError: null,
    loadFirstPage: feed.loadFirstPage,
    loadMore: feed.loadMore,
    refresh: feed.refresh,
  }),
}))
vi.mock("@tanstack/react-virtual", () => ({
  useWindowVirtualizer: () => ({
    getTotalSize: () => 176,
    getVirtualItems: () => [{ index: 0, key: "1", start: 0 }],
    measureElement: vi.fn(),
  }),
}))

// jsdom ships no TouchEvent constructor, and the hook only reads `touches`.
function touchEvent(type: "touchstart" | "touchmove" | "touchend", y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ clientY: y }],
  })
  return event
}

describe("RecommendationsCenter in the App target", () => {
  it("drops the counter and refresh control beside the title", () => {
    render(<RecommendationsCenter />)

    // The title stays: unlike /events this is not a tab root, so the app title
    // bar shows the section name rather than this page's own.
    expect(screen.getByRole("heading", { name: "向您推荐" })).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "刷新推荐列表" })
    ).not.toBeInTheDocument()
    expect(screen.queryByText("已加载 1 条")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /加载更多/ })
    ).not.toBeInTheDocument()
  })

  it("refreshes on a pull gesture and reports each stage", async () => {
    let settleRefresh: () => void = () => undefined
    feed.refresh.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settleRefresh = resolve
        })
    )
    render(<RecommendationsCenter />)

    act(() => {
      window.dispatchEvent(touchEvent("touchstart", 0))
    })
    act(() => {
      window.dispatchEvent(touchEvent("touchmove", 40))
    })
    expect(screen.getByText("下拉刷新")).toBeVisible()

    // 0.6 of the finger travel, so 140px clears the 72px threshold.
    act(() => {
      window.dispatchEvent(touchEvent("touchmove", 140))
    })
    expect(screen.getByText("松开立即刷新")).toBeVisible()
    expect(feed.refresh).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(touchEvent("touchend", 140))
    })
    expect(feed.refresh).toHaveBeenCalledOnce()
    expect(screen.getByText("正在刷新")).toBeVisible()

    await act(async () => {
      settleRefresh()
    })
    expect(screen.getByText("已是最新")).toBeVisible()
  })
})
