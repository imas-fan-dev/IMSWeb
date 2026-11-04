import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  installFetchMock,
  requestDetails,
  type FetchMock,
} from "@/tests/unit/support/api-client"
import {
  clearCsrfCookie,
  setCsrfCookie,
} from "@/tests/unit/support/auth-cookies"
import { renderPage } from "@/tests/unit/support/harness"
import AdminNamecardManagePage from "~/pages/admin/cards/manage"

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock("sonner", () => ({ toast: toasts }))

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: 793,
    image1_url: "https://cdn.test/front.webp",
    image2_url: null,
    status: "pending",
    revision: 5,
    producerName: "ZheiZhei",
    producerReading: null,
    origin: "exchange",
    lockReason: null,
    reviewStatus: null,
    reviewReason: null,
    pageCount: 2,
    ...overrides,
  }
}

function cardsBody(data: unknown[], pageInfo: Record<string, unknown> = {}) {
  return Response.json({
    success: true,
    data,
    pageInfo: {
      page: 1,
      pageSize: 10,
      total: data.length,
      totalPages: 1,
      hasNextPage: false,
      ...pageInfo,
    },
  })
}

const emptyQueue = () =>
  Response.json({
    success: true,
    data: [],
    pageInfo: {
      page: 1,
      pageSize: 12,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
    },
  })

/** The queue and the card list answer different paths; one mock serves both. */
function installHarness(cards: () => Response) {
  return installFetchMock(async (input) => {
    const url = new URL(String(input), "http://x")
    if (url.pathname.endsWith("/cards/feedback")) return emptyQueue()
    return cards()
  })
}

function cardsOnly(fetchMock: FetchMock) {
  return fetchMock.mock.calls
    .map((call) => new URL(requestDetails(call).url, "http://x"))
    .filter((url) => !url.pathname.endsWith("/feedback"))
}

afterEach(() => {
  vi.clearAllMocks()
  clearCsrfCookie("backoffice")
})

describe("AdminNamecardManagePage", () => {
  it("opens on the report queue and refreshes both tabs from the header", async () => {
    const fetchMock = installHarness(() => cardsBody([card()]))
    const user = userEvent.setup()

    renderPage(<AdminNamecardManagePage />, { route: "/admin/cards/manage" })

    expect(await screen.findByText("反馈队列")).toBeInTheDocument()
    expect(screen.queryByText("名片队列")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "刷新" }))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter((call) =>
          new URL(String(call[0]), "http://x").pathname.endsWith("/feedback")
        )
      ).toHaveLength(2)
    )
    expect(cardsOnly(fetchMock).length).toBeGreaterThanOrEqual(2)
  })

  it("lists the advanced queue with the review badges and only the actions a status allows", async () => {
    installHarness(() =>
      cardsBody([
        card({ reviewStatus: "pending", pageCount: 3 }),
        card({ id: 794, status: "published", producerName: null }),
      ])
    )

    renderPage(<AdminNamecardManagePage />, {
      route: "/admin/cards/manage?tab=advanced",
    })

    expect(await screen.findByText("名片队列")).toBeInTheDocument()
    expect(
      screen.getByText("每条投稿包含正面和背面两张图片 · 共 2 条记录")
    ).toBeInTheDocument()
    expect(screen.getByText("新版本")).toBeInTheDocument()
    expect(screen.getByText("名片 #794")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "通过" })).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: "驳回" })).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: /删除名片/ })).toHaveLength(2)
  })

  it("writes the search, the status and the origin into the query", async () => {
    const fetchMock = installHarness(() => cardsBody([card()]))
    const user = userEvent.setup()

    renderPage(<AdminNamecardManagePage />, {
      route: "/admin/cards/manage?tab=advanced",
    })
    await screen.findByText("名片队列")

    await user.type(screen.getByPlaceholderText("搜索制作人名称"), " Zhei ")
    await waitFor(() => {
      const last = cardsOnly(fetchMock).at(-1)!
      expect(last.searchParams.get("query")).toBe("Zhei")
    })

    await user.click(screen.getByRole("checkbox", { name: "游客投稿" }))
    await waitFor(() => {
      const last = cardsOnly(fetchMock).at(-1)!
      expect(last.searchParams.get("origin")).toBe("legacy")
    })

    await user.click(screen.getByRole("checkbox", { name: "注册用户投稿" }))
    await waitFor(() => {
      const last = cardsOnly(fetchMock).at(-1)!
      expect(last.searchParams.get("origin")).toBe("legacy,exchange")
    })

    await user.click(screen.getByRole("checkbox", { name: "游客投稿" }))
    await waitFor(() => {
      const last = cardsOnly(fetchMock).at(-1)!
      expect(last.searchParams.get("origin")).toBe("exchange")
    })
  })

  it("flags a pending submission instead of a plain reject when asked to", async () => {
    setCsrfCookie("backoffice", "csrf-token")
    const fetchMock = installFetchMock(async (input, init) => {
      const url = new URL(String(input), "http://x")
      if (url.pathname.endsWith("/cards/feedback")) return emptyQueue()
      if (init?.method === "POST") return Response.json({ success: true })
      return cardsBody([card({ reviewStatus: "pending" })])
    })
    const user = userEvent.setup()

    renderPage(<AdminNamecardManagePage />, {
      route: "/admin/cards/manage?tab=advanced",
    })
    await user.click(await screen.findByRole("button", { name: "驳回" }))

    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("驳回新版本")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "信息缺失" }))
    await user.click(within(dialog).getByLabelText("标记为违规"))
    await user.click(within(dialog).getByRole("button", { name: "确认删除" }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (call) => requestDetails(call).method === "POST"
      )
      expect(post).toBeDefined()
      const details = requestDetails(post!)
      expect(new URL(details.url, "http://x").pathname).toBe(
        "/api/admin/cards/flag/793"
      )
      expect(JSON.parse(String(details.body))).toEqual({
        expected_revision: 5,
        reason: "信息缺失",
      })
    })
    expect(toasts.success).toHaveBeenCalledWith("名片 #793 已驳回")
  })

  it("deletes through the confirm dialog and keeps the fallback focus in the list", async () => {
    setCsrfCookie("backoffice", "csrf-token")
    const fetchMock = installFetchMock(async (input, init) => {
      const url = new URL(String(input), "http://x")
      if (url.pathname.endsWith("/cards/feedback")) return emptyQueue()
      if (init?.method === "DELETE") {
        return Response.json({ success: true, revision: 6 })
      }
      return cardsBody([card({ status: "published" })])
    })
    const user = userEvent.setup()

    renderPage(<AdminNamecardManagePage />, {
      route: "/admin/cards/manage?tab=advanced",
    })
    await user.click(await screen.findByRole("button", { name: "删除名片 #793" }))

    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("删除名片 #793？")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "确认删除" }))

    await waitFor(() => {
      const removal = fetchMock.mock.calls.find(
        (call) => requestDetails(call).method === "DELETE"
      )
      expect(removal).toBeDefined()
      expect(new URL(requestDetails(removal!).url, "http://x").pathname).toBe(
        "/api/admin/cards/793"
      )
    })
    expect(toasts.success).toHaveBeenCalledWith("名片 #793 已删除")
  })

  it("separates an unreadable queue from an empty one", async () => {
    installHarness(() => Response.json({ message: "boom" }, { status: 500 }))

    const { unmount } = renderPage(<AdminNamecardManagePage />, {
      route: "/admin/cards/manage?tab=advanced",
    })
    expect(await screen.findByText("无法读取名片队列")).toBeInTheDocument()
    unmount()

    installHarness(() => cardsBody([]))
    renderPage(<AdminNamecardManagePage />, {
      route: "/admin/cards/manage?tab=advanced",
    })
    expect(await screen.findByText("当前页没有名片")).toBeInTheDocument()
  })
})
