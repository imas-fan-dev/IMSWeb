import { useRequest } from "alova/client"
import { act, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import { getHomeNews } from "~/lib/api"
import { HomeFeed } from "~/pages/home/components/home-feed"

function NewsProbe({ onSuccess }: { onSuccess: (data: unknown) => void }) {
  const {
    loading,
    data,
    error,
    onSuccess: onRequestSuccess,
  } = useRequest(getHomeNews(), {
    initialData: {
      items: [],
      pageInfo: {
        nextCursor: null,
        hasNextPage: false,
        snapshotAt: null,
      },
    },
  })
  onRequestSuccess((event) => onSuccess(event.data))

  if (loading) return <p>loading</p>
  if (error) return <p>error: {error.message}</p>
  return <p>{data.items.map((item) => item.title).join(", ") || "empty"}</p>
}

function renderHomeFeed() {
  return render(
    <MemoryRouter>
      <HomeFeed />
    </MemoryRouter>
  )
}

describe("home feed alova integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("updates React state with parsed news data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 1,
            title: "测试资讯",
            thumbnail: null,
            content: "https://example.com/news",
            date: "2026-07-22T00:00:00.000Z",
          },
        ]),
        { headers: { "content-type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", fetchMock)
    const onSuccess = vi.fn()

    render(<NewsProbe onSuccess={onSuccess} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
    expect(onSuccess.mock.calls[0]?.[0]).toEqual({
      items: [expect.objectContaining({ title: "测试资讯" })],
      pageInfo: {
        nextCursor: null,
        hasNextPage: false,
        snapshotAt: null,
      },
    })
    expect(await screen.findByText("测试资讯")).toBeVisible()
  })

  it("keeps four activity summaries and routes the full list to /events", async () => {
    const longContact =
      "https://example.com/events/very-long-contact-path?source=homepage&campaign=summer"
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })
    )
    const events = Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      title: `首页活动 ${index + 1}`,
      name: "测试发布者",
      contact: index === 0 ? longContact : null,
      image_url: null,
      created_at: "2026-07-24T00:00:00.000Z",
    }))
    const news = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      title: `首页资讯 ${index + 1}`,
      thumbnail: null,
      content: `https://example.com/news/${index + 1}`,
      date: "2026-07-24T00:00:00.000Z",
    }))
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes("/api/events")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: events,
              pageInfo: {
                nextCursor: "more-events",
                hasNextPage: true,
                snapshotAt: "6",
              },
            }),
            { headers: { "content-type": "application/json" } }
          )
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify(news), {
          headers: { "content-type": "application/json" },
        })
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    const { container } = renderHomeFeed()

    expect(await screen.findByText("首页活动 4")).toBeVisible()
    expect(screen.queryByText("首页活动 5")).not.toBeInTheDocument()
    expect(screen.queryByText(/条活动/)).not.toBeInTheDocument()
    expect(screen.queryByText(/显示其余/)).not.toBeInTheDocument()
    expect(screen.queryByRole("group")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "查看全部动态" })).toHaveAttribute(
      "href",
      "/events"
    )
    expect(screen.getByRole("link", { name: "查看全部推荐" })).toHaveAttribute(
      "href",
      "/recommendations"
    )
    expect(screen.getByText("首页资讯 4")).toBeVisible()
    expect(screen.queryByText("首页资讯 5")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /首页活动 1/ })).toHaveAttribute(
      "href",
      "/events/1"
    )
    expect(screen.getByRole("link", { name: /首页活动 1/ })).toHaveClass(
      "min-h-11",
      "min-w-0"
    )
    expect(screen.getByRole("link", { name: "查看全部动态" })).toHaveClass(
      "min-h-11"
    )
    expect(screen.getByText("首页活动 1")).toHaveClass("line-clamp-2")
    expect(screen.getByText("首页活动 1")).toHaveAttribute(
      "title",
      "首页活动 1"
    )
    expect(screen.getAllByTitle("测试发布者 · 2026/07/24")[0]).toHaveClass(
      "line-clamp-1",
      "wrap-anywhere"
    )
    expect(screen.getByText(longContact)).toHaveClass(
      "line-clamp-1",
      "break-all"
    )
    expect(screen.getByText(longContact)).toHaveAttribute("title", longContact)
    expect(screen.getByText("首页资讯 1")).toHaveClass("line-clamp-2")
    expect(container.querySelector('a[href="/Event.html"]')).toBeNull()

    const eventRequest = fetchMock.mock.calls
      .map(([input]) => (input instanceof Request ? input.url : String(input)))
      .find((url) => url.includes("/api/events"))
    expect(eventRequest).toBeDefined()
    const eventUrl = new URL(eventRequest!, "http://localhost")
    expect(eventUrl.searchParams.get("limit")).toBe("4")
    expect(eventUrl.searchParams.has("page")).toBe(false)
    expect(eventUrl.searchParams.has("size")).toBe(false)

    const newsRequest = fetchMock.mock.calls
      .map(([input]) => (input instanceof Request ? input.url : String(input)))
      .find((url) => url.includes("/api/news"))
    expect(newsRequest).toBeDefined()
    const newsUrl = new URL(newsRequest!, "http://localhost")
    expect(newsUrl.searchParams.get("limit")).toBe("4")
    expect(newsUrl.searchParams.has("cursor")).toBe(false)
  })

  it("requests and renders only three summaries on a narrow viewport", async () => {
    let desktop = false
    let breakpointListener: ((event: MediaQueryListEvent) => void) | undefined
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        get matches() {
          return desktop
        },
        addEventListener: (
          _type: string,
          listener: (event: MediaQueryListEvent) => void
        ) => {
          breakpointListener = listener
        },
        removeEventListener: vi.fn(),
      })
    )
    const events = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      title: `窄屏活动 ${index + 1}`,
      name: null,
      contact: null,
      image_url: null,
      created_at: null,
    }))
    const news = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      title: `窄屏推荐 ${index + 1}`,
      thumbnail: null,
      content: `https://example.com/narrow/${index + 1}`,
      date: null,
    }))
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes("/api/events")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: events,
              pageInfo: {
                nextCursor: "more-events",
                hasNextPage: true,
                snapshotAt: "5",
              },
            }),
            { headers: { "content-type": "application/json" } }
          )
        )
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: news,
            pageInfo: {
              nextCursor: "more-news",
              hasNextPage: true,
              snapshotAt: "5",
            },
          }),
          { headers: { "content-type": "application/json" } }
        )
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    renderHomeFeed()

    expect(await screen.findByText("窄屏活动 3")).toBeVisible()
    expect(screen.queryByText("窄屏活动 4")).not.toBeInTheDocument()
    expect(screen.getByText("窄屏推荐 3")).toBeVisible()
    expect(screen.queryByText("窄屏推荐 4")).not.toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const urls = fetchMock.mock.calls.map(
      ([input]) =>
        new URL(
          input instanceof Request ? input.url : String(input),
          "http://localhost"
        )
    )
    expect(
      urls
        .find((url) => url.pathname === "/api/events")
        ?.searchParams.get("limit")
    ).toBe("3")
    expect(
      urls
        .find((url) => url.pathname === "/api/news")
        ?.searchParams.get("limit")
    ).toBe("3")

    act(() => {
      desktop = true
      breakpointListener?.({ matches: true } as MediaQueryListEvent)
    })
    expect(await screen.findByText("窄屏活动 4")).toBeVisible()
    expect(await screen.findByText("窄屏推荐 4")).toBeVisible()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))

    const resizedUrls = fetchMock.mock.calls
      .slice(2)
      .map(
        ([input]) =>
          new URL(
            input instanceof Request ? input.url : String(input),
            "http://localhost"
          )
      )
    expect(
      resizedUrls
        .find((url) => url.pathname === "/api/events")
        ?.searchParams.get("limit")
    ).toBe("4")
    expect(
      resizedUrls
        .find((url) => url.pathname === "/api/news")
        ?.searchParams.get("limit")
    ).toBe("4")
  })
})
