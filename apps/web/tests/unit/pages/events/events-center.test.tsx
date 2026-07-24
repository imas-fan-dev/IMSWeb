import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EventsCenter } from "~/pages/events/events-center"
import { EVENTS_SESSION_CACHE_KEY } from "~/pages/events/hooks/events-feed-cache"

const { virtualizerOptions } = vi.hoisted(() => ({
  virtualizerOptions: vi.fn(),
}))

vi.mock("@tanstack/react-virtual", () => ({
  useWindowVirtualizer: (options: {
    count: number
    getItemKey: (index: number) => string | number
  }) => {
    virtualizerOptions(options)
    const renderedCount = Math.min(options.count, 12)
    return {
      getTotalSize: () => options.count * 176,
      getVirtualItems: () =>
        Array.from({ length: renderedCount }, (_, index) => ({
          index,
          key: options.getItemKey(index),
          start: index * 176,
        })),
      measureElement: vi.fn(),
    }
  },
}))

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  })
}

function requestUrl(input: RequestInfo | URL) {
  return input instanceof Request ? input.url : String(input)
}

function event(id: number) {
  return {
    id,
    title: `活动 ${id}`,
    name: "测试发布者",
    contact: `QQ群 ${id}`,
    image_url: null,
    created_at: "2026-07-24T00:00:00.000Z",
  }
}

describe("EventsCenter", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.stubGlobal("scrollTo", vi.fn())
    vi.stubGlobal("IntersectionObserver", undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("loads cursor pages, deduplicates rows, and exposes a manual fallback", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [event(3), event(2)],
          pageInfo: {
            nextCursor: "next-page",
            hasNextPage: true,
            snapshotAt: "3",
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [event(2), event(1)],
          pageInfo: {
            nextCursor: null,
            hasNextPage: false,
            snapshotAt: "3",
          },
        })
      )
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    render(<EventsCenter />)

    expect(await screen.findByRole("heading", { name: "活动 3" })).toBeVisible()
    await user.click(screen.getByRole("button", { name: "加载更多活动" }))

    expect(await screen.findByRole("heading", { name: "活动 1" })).toBeVisible()
    expect(screen.getAllByRole("heading", { name: "活动 2" })).toHaveLength(1)
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getByText("已显示本批次的全部活动")).toBeVisible()

    const firstUrl = new URL(
      requestUrl(fetchMock.mock.calls[0]![0]),
      "http://localhost"
    )
    const secondUrl = new URL(
      requestUrl(fetchMock.mock.calls[1]![0]),
      "http://localhost"
    )
    expect(firstUrl.searchParams.get("limit")).toBe("20")
    expect(firstUrl.searchParams.has("page")).toBe(false)
    expect(secondUrl.searchParams.get("cursor")).toBe("next-page")
  })

  it("recovers from the initial error into the empty state", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [],
          pageInfo: {
            nextCursor: null,
            hasNextPage: false,
            snapshotAt: null,
          },
        })
      )
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()

    render(<EventsCenter />)

    expect(await screen.findByText("活动暂时无法加载")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "重新加载" }))
    expect(await screen.findByText("当前没有已发布活动")).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("automatically loads when the bottom sentinel enters the prefetch margin", async () => {
    let intersect: (() => void) | undefined
    class TestIntersectionObserver {
      readonly root = null
      readonly rootMargin = ""
      readonly thresholds: number[] = []

      constructor(callback: IntersectionObserverCallback) {
        intersect = () =>
          callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver
          )
      }

      observe() {
        return undefined
      }
      unobserve() {
        return undefined
      }
      disconnect() {
        return undefined
      }
      takeRecords() {
        return []
      }
    }
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver)
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [event(2)],
          pageInfo: {
            nextCursor: "auto-next",
            hasNextPage: true,
            snapshotAt: "2",
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [event(1)],
          pageInfo: {
            nextCursor: null,
            hasNextPage: false,
            snapshotAt: "2",
          },
        })
      )
    vi.stubGlobal("fetch", fetchMock)

    render(<EventsCenter />)

    expect(await screen.findByRole("heading", { name: "活动 2" })).toBeVisible()
    await waitFor(() => expect(intersect).toBeDefined())
    act(() => intersect?.())
    expect(await screen.findByRole("heading", { name: "活动 1" })).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("restores a large session snapshot while keeping the DOM bounded", async () => {
    const items = Array.from({ length: 65 }, (_, index) => event(65 - index))
    window.sessionStorage.setItem(
      EVENTS_SESSION_CACHE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        scrollY: 720,
        items,
        pageInfo: {
          nextCursor: null,
          hasNextPage: false,
          snapshotAt: "65",
        },
      })
    )
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)

    render(<EventsCenter />)

    expect(await screen.findByText("已加载 65 条")).toBeVisible()
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(12)
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(virtualizerOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        count: 65,
        overscan: 6,
        useFlushSync: false,
      })
    )
  })
})
