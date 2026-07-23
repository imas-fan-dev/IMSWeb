import { useRequest } from "alova/client"
import { render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { getHomeNews } from "./api"

function NewsProbe({ onSuccess }: { onSuccess: (data: unknown) => void }) {
  const {
    loading,
    data,
    error,
    onSuccess: onRequestSuccess,
  } = useRequest(getHomeNews(), { initialData: [] })
  onRequestSuccess((event) => onSuccess(event.data))

  if (loading) return <p>loading</p>
  if (error) return <p>error: {error.message}</p>
  return <p>{data.map((item) => item.title).join(", ") || "empty"}</p>
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
    expect(onSuccess.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ title: "测试资讯" }),
    ])
    expect(await screen.findByText("测试资讯")).toBeVisible()
  })
})
