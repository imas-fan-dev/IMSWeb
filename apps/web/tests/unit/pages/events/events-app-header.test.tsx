import { act, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import { EventsCenter } from "~/pages/events/index"

const feed = vi.hoisted(() => ({
  refresh: vi.fn(),
  loadFirstPage: vi.fn(),
  loadMore: vi.fn(),
}))

vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))
vi.mock("~/pages/events/hooks/use-events-feed", () => ({
  useEventsFeed: () => ({
    phase: "ready",
    items: [
      {
        id: "1",
        title: "测试活动",
        name: "测试发布者",
        contact: null,
        image_url: null,
        created_at: "2026-07-24T00:00:00.000Z",
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

function renderEventsCenter() {
  return render(
    <MemoryRouter>
      <EventsCenter />
    </MemoryRouter>
  )
}

describe("EventsCenter in the App target", () => {
  it("drops the page header in favour of the title bar", () => {
    renderEventsCenter()

    expect(
      screen.queryByRole("heading", { name: "近期活动" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "刷新社区动态列表" })
    ).not.toBeInTheDocument()
    expect(screen.queryByText("已加载 1 条")).not.toBeInTheDocument()
    expect(screen.queryByText("EVENTS")).not.toBeInTheDocument()

    // The visible title is gone, not the accessible one.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "社区动态"
    )
  })

  it("refreshes on a pull gesture and reports each stage", async () => {
    let settleRefresh: () => void = () => undefined
    feed.refresh.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settleRefresh = resolve
        })
    )
    renderEventsCenter()

    act(() => {
      window.dispatchEvent(touchEvent("touchstart", 0))
    })
    act(() => {
      window.dispatchEvent(touchEvent("touchmove", 40))
    })
    expect(screen.getByText("下拉刷新")).toBeVisible()
    expect(feed.refresh).not.toHaveBeenCalled()

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

  it("docks the indicator inside the band so the header cannot cover it", () => {
    renderEventsCenter()

    act(() => {
      window.dispatchEvent(touchEvent("touchstart", 0))
    })
    act(() => {
      window.dispatchEvent(touchEvent("touchmove", 40))
    })

    // The end-of-list paragraph is also a status region, so scope by label.
    const indicator = screen.getByText("下拉刷新").closest('[role="status"]')
    const band = indicator?.parentElement

    expect(indicator).not.toBeNull()

    // The band is the element the gesture translates. Keeping the indicator
    // inside it is what fixes the header overlap: both layouts wrap the page in
    // a z-10 stacking context, so an indicator anchored to the viewport is
    // resolved below the z-40 header no matter what z-index it claims.
    expect(band?.style.transform).toBe("translateY(24px)")
    expect(band?.className).toContain("relative")
    expect(indicator?.className).toContain("absolute")
    expect(indicator?.className).toContain("bottom-full")
    expect(indicator?.className).not.toContain("fixed")

    // The band already carries the pull distance; a second transform here would
    // move the indicator twice as far as the list it belongs to.
    expect((indicator as HTMLElement).style.transform).toBe("")
  })

  it("ignores a pull that stops short of the threshold", () => {
    feed.refresh.mockReset()
    renderEventsCenter()

    act(() => {
      window.dispatchEvent(touchEvent("touchstart", 0))
    })
    act(() => {
      window.dispatchEvent(touchEvent("touchmove", 60))
    })
    act(() => {
      window.dispatchEvent(touchEvent("touchend", 60))
    })

    expect(feed.refresh).not.toHaveBeenCalled()
    expect(screen.queryByText("正在刷新")).not.toBeInTheDocument()
    expect(screen.queryByText("下拉刷新")).not.toBeInTheDocument()
  })
})
