import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  installFetchMock,
  requestDetails,
} from "@/tests/unit/support/api-client"
import { renderPage } from "@/tests/unit/support/harness"
import { NamecardFeedbackQueue } from "~/pages/admin/cards/namecard-feedback-queue"

function feedback(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    cardNumber: 793,
    producerName: "ZheiZhei",
    image1_url: "https://cdn.test/front.webp",
    image2_url: null,
    pageCount: 2,
    reporterName: "调试用户",
    reason: "content-violation",
    detail: "这张卡不是他的",
    createdAt: "2026-10-30T11:00:00.000Z",
    ...overrides,
  }
}

function listBody(data: unknown[], pageInfo: Record<string, unknown> = {}) {
  return Response.json({
    success: true,
    data,
    pageInfo: {
      page: 1,
      pageSize: 12,
      total: data.length,
      totalPages: data.length ? 1 : 0,
      hasNextPage: false,
      ...pageInfo,
    },
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("NamecardFeedbackQueue", () => {
  it("shows the producer, the reporter and the multi-page badge of every report", async () => {
    const fetchMock = installFetchMock(async () =>
      listBody([
        feedback({ pageCount: 3 }),
        feedback({ id: 12, cardNumber: 791, producerName: null }),
      ])
    )

    const { container } = renderPage(<NamecardFeedbackQueue reloadToken={0} />, {
      route: "/admin/cards/manage",
    })

    expect(await screen.findByText("反馈队列")).toBeInTheDocument()
    expect(
      screen.getByText("名片墙上提交的反馈 · 共 2 条待处理")
    ).toBeInTheDocument()
    expect(screen.getByText("ZheiZhei")).toBeInTheDocument()
    expect(screen.getByText("名片 #791")).toBeInTheDocument()
    expect(screen.getAllByText("反馈人：调试用户")).toHaveLength(2)
    expect(within(container).getByText("3")).toBeInTheDocument()
    expect(
      container.querySelectorAll("[data-feedback-id]")
    ).toHaveLength(2)

    const url = new URL(requestDetails(fetchMock.mock.calls[0]!).url, "http://x")
    expect(url.pathname).toBe("/api/admin/cards/feedback")
    expect(url.searchParams.get("page")).toBe("1")
  })

  it("re-reads the queue when the page header refreshes", async () => {
    const fetchMock = installFetchMock(async () => listBody([feedback()]))
    const { rerender } = renderPage(
      <NamecardFeedbackQueue reloadToken={0} />,
      { route: "/admin/cards/manage" }
    )
    await screen.findByText("ZheiZhei")

    rerender(<NamecardFeedbackQueue reloadToken={1} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it("pages through the queue without losing the rest of the query", async () => {
    const fetchMock = installFetchMock(async () =>
      listBody([feedback()], { page: 1, total: 30, totalPages: 3, hasNextPage: true })
    )
    const user = userEvent.setup()

    renderPage(<NamecardFeedbackQueue reloadToken={0} />, {
      route: "/admin/cards/manage?tab=advanced",
    })
    await screen.findByText("ZheiZhei")

    await user.click(screen.getByRole("button", { name: /下一页/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const next = new URL(requestDetails(fetchMock.mock.calls[1]!).url, "http://x")
    expect(next.searchParams.get("page")).toBe("2")
  })

  it("separates an unreadable queue from an empty one", async () => {
    installFetchMock(async () => Response.json({ message: "boom" }, { status: 500 }))

    const { unmount } = renderPage(
      <NamecardFeedbackQueue reloadToken={0} />,
      { route: "/admin/cards/manage" }
    )
    expect(await screen.findByText("无法读取反馈队列")).toBeInTheDocument()
    unmount()

    installFetchMock(async () => listBody([]))
    renderPage(<NamecardFeedbackQueue reloadToken={0} />, {
      route: "/admin/cards/manage",
    })
    expect(await screen.findByText("没有待处理的反馈")).toBeInTheDocument()
  })
})
