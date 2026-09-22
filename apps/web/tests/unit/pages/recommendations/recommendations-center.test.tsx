import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { installFetchMock, jsonResponse } from "@/tests/unit/support/api-client"
import { RecommendationsCenter } from "~/pages/recommendations/index"
import { cacheRecommendationFeed, parseRecommendationPage } from "~/lib/api"
import type { Recommendation } from "~/lib/api"

const { measureVirtualizer, virtualizerOptions } = vi.hoisted(() => ({
  measureVirtualizer: vi.fn(),
  virtualizerOptions: vi.fn(),
}))

let mediaMatches = true
let mediaChangeListener: (() => void) | undefined

vi.mock("@tanstack/react-virtual", () => ({
  useWindowVirtualizer: (options: {
    count: number
    estimateSize: () => number
    getItemKey: (index: number) => string | number
  }) => {
    virtualizerOptions(options)
    const renderedCount = Math.min(options.count, 12)
    const estimatedSize = options.estimateSize()
    return {
      getTotalSize: () => options.count * estimatedSize,
      getVirtualItems: () =>
        Array.from({ length: renderedCount }, (_, index) => ({
          index,
          key: options.getItemKey(index),
          start: index * estimatedSize,
        })),
      measure: measureVirtualizer,
      measureElement: vi.fn(),
    }
  },
}))

function requestUrl(input: RequestInfo | URL) {
  return input instanceof Request ? input.url : String(input)
}

function recommendation(id: number) {
  return {
    id,
    title: `推荐 ${id}`,
    thumbnail: null,
    content: `https://example.com/recommendations/${id}`,
    date: "2026-07-24T00:00:00.000Z",
  }
}

function cachedRecommendation(id: number): Recommendation {
  return { ...recommendation(id), id: String(id) }
}

describe("RecommendationsCenter", () => {
  beforeEach(() => {
    mediaMatches = true
    mediaChangeListener = undefined
    measureVirtualizer.mockClear()
    virtualizerOptions.mockClear()
    vi.stubGlobal("scrollTo", vi.fn())
    vi.stubGlobal("IntersectionObserver", undefined)
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches: mediaMatches,
        addEventListener: (_event: string, listener: () => void) => {
          mediaChangeListener = listener
        },
        removeEventListener: vi.fn(),
      }))
    )
  })

  it("rejects imprecise numeric IDs while accepting PostgreSQL bigint strings", () => {
    expect(() =>
      parseRecommendationPage([recommendation(Number.MAX_SAFE_INTEGER + 1)])
    ).toThrow()
    expect(
      parseRecommendationPage([
        { ...recommendation(1), id: "9223372036854775807" },
      ]).items[0]?.id
    ).toBe("9223372036854775807")
  })

  it("loads cursor pages by scroll alone and deduplicates rows", async () => {
    const fetchMock = installFetchMock()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [recommendation(3), recommendation(2)],
          pageInfo: {
            nextCursor: "next-page",
            hasNextPage: true,
            snapshotAt: "3",
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [recommendation(2), recommendation(1)],
          pageInfo: {
            nextCursor: null,
            hasNextPage: false,
            snapshotAt: "3",
          },
        })
      )

    const { container } = render(<RecommendationsCenter />)

    expect(
      container.querySelector('[aria-label="正在加载推荐"] > div')
    ).toHaveClass(
      "min-h-36",
      "grid-cols-[6.5rem_minmax(0,1fr)]",
      "gap-4",
      "border-b",
      "py-5",
      "sm:grid-cols-[9rem_minmax(0,1fr)]",
      "sm:gap-6"
    )

    // No click anywhere. With IntersectionObserver stubbed out, the scroll
    // fallback is what carries the list, and it runs once on mount so a first
    // page shorter than the viewport still advances.
    expect(await screen.findByRole("heading", { name: "推荐 3" })).toBeVisible()
    expect(await screen.findByRole("heading", { name: "推荐 1" })).toBeVisible()
    expect(screen.getAllByRole("heading", { name: "推荐 2" })).toHaveLength(1)
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getByText("已显示本批次的全部推荐")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: /加载更多/ })
    ).not.toBeInTheDocument()

    const firstUrl = new URL(
      requestUrl(fetchMock.mock.calls[0]![0]),
      "http://localhost"
    )
    const secondUrl = new URL(
      requestUrl(fetchMock.mock.calls[1]![0]),
      "http://localhost"
    )
    expect(firstUrl.searchParams.get("limit")).toBe("20")
    expect(firstUrl.searchParams.has("cursor")).toBe(false)
    expect(secondUrl.searchParams.get("cursor")).toBe("next-page")
  })

  it("recovers from the initial error into the empty state", async () => {
    const fetchMock = installFetchMock()
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
    const user = userEvent.setup()

    render(<RecommendationsCenter />)

    expect(await screen.findByText("推荐暂时无法加载")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "重新加载" }))
    expect(await screen.findByText("当前没有已发布推荐")).toBeVisible()
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
    const fetchMock = installFetchMock()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [recommendation(2)],
          pageInfo: {
            nextCursor: "auto-next",
            hasNextPage: true,
            snapshotAt: "2",
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [recommendation(1)],
          pageInfo: {
            nextCursor: null,
            hasNextPage: false,
            snapshotAt: "2",
          },
        })
      )

    render(<RecommendationsCenter />)

    expect(await screen.findByRole("heading", { name: "推荐 2" })).toBeVisible()
    await waitFor(() => expect(intersect).toBeDefined())
    act(() => intersect?.())
    expect(await screen.findByRole("heading", { name: "推荐 1" })).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("restores a large Alova snapshot while keeping the DOM bounded", async () => {
    const items = Array.from({ length: 65 }, (_, index) =>
      cachedRecommendation(65 - index)
    )
    await cacheRecommendationFeed({
      items,
      pageInfo: {
        nextCursor: null,
        hasNextPage: false,
        snapshotAt: "65",
      },
    })
    const fetchMock = installFetchMock()

    render(<RecommendationsCenter />)

    expect(await screen.findByText("已加载 65 条")).toBeVisible()
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(24)
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(virtualizerOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        count: 33,
        overscan: 6,
        useFlushSync: false,
      })
    )
    expect(virtualizerOptions.mock.lastCall?.[0].estimateSize()).toBe(176)
  })

  it("packs desktop items into virtual rows and returns to one column below lg", async () => {
    await cacheRecommendationFeed({
      items: Array.from({ length: 5 }, (_, index) =>
        cachedRecommendation(5 - index)
      ),
      pageInfo: {
        nextCursor: null,
        hasNextPage: false,
        snapshotAt: "5",
      },
    })

    render(<RecommendationsCenter />)

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(5))
    expect(virtualizerOptions.mock.lastCall?.[0].count).toBe(3)
    expect(
      screen.getAllByRole("listitem").map((item) => ({
        position: item.getAttribute("aria-posinset"),
        size: item.getAttribute("aria-setsize"),
      }))
    ).toEqual([
      { position: "1", size: "5" },
      { position: "2", size: "5" },
      { position: "3", size: "5" },
      { position: "4", size: "5" },
      { position: "5", size: "5" },
    ])
    expect(screen.getAllByRole("listitem")[0]?.parentElement).toHaveClass(
      "grid-cols-2",
      "gap-x-6"
    )
    expect(screen.getAllByRole("listitem")[0]?.parentElement).toHaveAttribute(
      "role",
      "presentation"
    )

    act(() => {
      mediaMatches = false
      mediaChangeListener?.()
    })

    await waitFor(() =>
      expect(virtualizerOptions.mock.lastCall?.[0].count).toBe(5)
    )
    expect(screen.getAllByRole("listitem")[0]?.parentElement).toHaveClass(
      "grid-cols-1"
    )
    expect(screen.getAllByRole("listitem")[0]?.parentElement).not.toHaveClass(
      "grid-cols-2"
    )
    expect(measureVirtualizer).toHaveBeenCalled()
  })

  it("bypasses the Alova snapshot when the user refreshes", async () => {
    await cacheRecommendationFeed({
      items: [{ ...cachedRecommendation(1), title: "缓存中的推荐" }],
      pageInfo: {
        nextCursor: null,
        hasNextPage: false,
        snapshotAt: "1",
      },
    })
    const fetchMock = installFetchMock().mockResolvedValueOnce(
      jsonResponse({
        items: [recommendation(1)],
        pageInfo: {
          nextCursor: null,
          hasNextPage: false,
          snapshotAt: "1",
        },
      })
    )
    const user = userEvent.setup()

    render(<RecommendationsCenter />)

    expect(
      await screen.findByRole("heading", { name: "缓存中的推荐" })
    ).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "刷新推荐列表" }))

    expect(await screen.findByRole("heading", { name: "推荐 1" })).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
