import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
    error: null,
    loadMoreError: null,
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

describe("EventsCenter in the App target", () => {
  it("uses a compact title and icon refresh control", async () => {
    const user = userEvent.setup()
    render(<EventsCenter />)

    expect(screen.getByRole("heading", { name: "近期活动" })).toBeVisible()
    expect(
      screen.queryByRole("heading", { name: "活动中心" })
    ).not.toBeInTheDocument()
    expect(screen.queryByText("EVENTS")).not.toBeInTheDocument()
    expect(screen.getByText("已加载 1 条")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "刷新活动列表" }))
    expect(feed.refresh).toHaveBeenCalledOnce()
  })
})
