import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  installFetchMock,
  requestDetails,
} from "@/tests/unit/support/api-client"
import { renderPage } from "@/tests/unit/support/harness"
import AdminNamecardAuditPage from "~/pages/admin/platform-audit/index"

const ROUTE = "/admin/cards/audit"

function pageInfo(total = 1) {
  return {
    page: 1,
    pageSize: 20,
    total,
    totalPages: total > 20 ? 2 : total === 0 ? 0 : 1,
    hasNextPage: total > 20,
  }
}

function lockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    cardNumber: 793,
    producerName: "ZheiZhei",
    owner: { name: "调试用户", total: 3, pageCount: 2 },
    action: "locked",
    reason: "非企划内容",
    handledBy: "debugadmin",
    occurredAt: "2026-10-30T09:30:00.000Z",
    ...overrides,
  }
}

function feedbackRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    cardNumber: 791,
    producerName: null,
    owner: null,
    reporter: { name: "举报人", total: 1, pageCount: 1 },
    reason: "content-violation",
    outcome: "rejected",
    handledBy: "debugadmin",
    handledAt: "2026-10-30T11:00:00.000Z",
    ...overrides,
  }
}

function listBody(data: unknown[], total = data.length) {
  return Response.json({ success: true, data, pageInfo: pageInfo(total) })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("AdminNamecardAuditPage", () => {
  it("lists the lock trail with the reason, the handler and the repeat count", async () => {
    const fetchMock = installFetchMock(async () =>
      listBody([
        lockRow(),
        lockRow({
          id: 2,
          cardNumber: 700,
          action: "unlocked",
          owner: null,
          producerName: null,
          reason: null,
          handledBy: null,
        }),
      ])
    )

    renderPage(<AdminNamecardAuditPage />, { route: ROUTE })

    const rows = await screen.findAllByRole("row")
    expect(rows).toHaveLength(3)
    expect(screen.getByText("名片 #793")).toBeInTheDocument()
    expect(screen.getByText("ZheiZhei")).toBeInTheDocument()
    expect(screen.getByText("已锁定")).toBeInTheDocument()
    expect(screen.getByText("已解锁")).toBeInTheDocument()
    expect(screen.getByText("非企划内容")).toBeInTheDocument()
    expect(screen.getByText("debugadmin")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /调试用户/ })).toHaveAttribute(
      "title",
      "调试用户：本页 2 条，累计 3 条"
    )
    expect(screen.getByText("无归属用户")).toBeInTheDocument()
    expect(screen.getByText("未填写制作人")).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "操作" })).toBeInTheDocument()

    const url = new URL(requestDetails(fetchMock.mock.calls[0]!).url, "http://x")
    expect(url.pathname).toBe("/api/admin/cards/audit/locks")
    expect(url.searchParams.get("page")).toBe("1")
    expect(url.searchParams.has("owner")).toBe(false)
  })

  it("filters by the owner when a name is clicked, and clears the field alone", async () => {
    const fetchMock = installFetchMock(async () => listBody([lockRow()]))
    const user = userEvent.setup()

    renderPage(<AdminNamecardAuditPage />, { route: ROUTE })
    await user.click(await screen.findByRole("button", { name: /调试用户/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const filtered = new URL(
      requestDetails(fetchMock.mock.calls[1]!).url,
      "http://x"
    )
    expect(filtered.searchParams.get("owner")).toBe("调试用户")
    expect(screen.getByLabelText("归属用户")).toHaveValue("调试用户")
    expect(screen.getByRole("button", { name: "清除筛选" })).toBeEnabled()

    await user.click(screen.getByRole("button", { name: "清空显示名称或账号 ID" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    const cleared = new URL(
      requestDetails(fetchMock.mock.calls[2]!).url,
      "http://x"
    )
    expect(cleared.searchParams.has("owner")).toBe(false)
    expect(screen.getByLabelText("归属用户")).toHaveValue("")
    expect(screen.getByRole("button", { name: "清除筛选" })).toBeDisabled()
  })

  it("types a filter once per pause and forwards only the trimmed value", async () => {
    const fetchMock = installFetchMock(async () => listBody([lockRow()]))
    const user = userEvent.setup()

    renderPage(<AdminNamecardAuditPage />, { route: ROUTE })
    const input = await screen.findByLabelText("锁定理由")
    await user.type(input, "  spam  ")

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const filtered = new URL(
      requestDetails(fetchMock.mock.calls[1]!).url,
      "http://x"
    )
    expect(filtered.searchParams.get("reason")).toBe("spam")
    expect(filtered.searchParams.get("page")).toBe("1")
  })

  it("switches to the settled reports and resets every filter at once", async () => {
    const fetchMock = installFetchMock(async () => listBody([feedbackRow()]))
    const user = userEvent.setup()

    renderPage(<AdminNamecardAuditPage />, {
      route: `${ROUTE}?tab=feedback&owner=%E8%B0%83%E8%AF%95%E7%94%A8%E6%88%B7&outcome=rejected&page=2`,
    })

    expect(
      await screen.findByRole("columnheader", { name: "反馈人" })
    ).toBeInTheDocument()
    expect(screen.getByText("信息违规")).toBeInTheDocument()
    const body = screen.getAllByRole("row")[1]!
    expect(within(body).getByText("未受理")).toBeInTheDocument()
    expect(screen.getByText("无归属用户")).toBeInTheDocument()
    expect(screen.getByLabelText("归属用户")).toHaveValue("调试用户")

    const requested = new URL(
      requestDetails(fetchMock.mock.calls[0]!).url,
      "http://x"
    )
    expect(requested.pathname).toBe("/api/admin/cards/audit/feedback")
    expect(requested.searchParams.get("owner")).toBe("调试用户")
    expect(requested.searchParams.get("outcome")).toBe("rejected")
    expect(requested.searchParams.get("page")).toBe("2")

    await user.click(screen.getByRole("button", { name: "清除筛选" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const reset = new URL(requestDetails(fetchMock.mock.calls[1]!).url, "http://x")
    expect(reset.pathname).toBe("/api/admin/cards/audit/feedback")
    expect(reset.searchParams.get("owner")).toBeNull()
    expect(reset.searchParams.get("outcome")).toBeNull()
    expect(screen.getByLabelText("归属用户")).toHaveValue("")
    expect(screen.getByRole("button", { name: "清除筛选" })).toBeDisabled()
  })

  it("says which empty table it is showing and offers the filter hint", async () => {
    installFetchMock(async () => listBody([]))

    const { unmount } = renderPage(<AdminNamecardAuditPage />, { route: ROUTE })
    expect(
      await screen.findByText("还没有任何锁定记录。")
    ).toBeInTheDocument()
    unmount()

    renderPage(<AdminNamecardAuditPage />, {
      route: `${ROUTE}?tab=feedback&reporter=%E4%B8%BE%E6%8A%A5%E4%BA%BA`,
    })
    expect(await screen.findByText("换一个筛选条件试试。")).toBeInTheDocument()
  })

  it("reports a table it could not read instead of an empty one", async () => {
    installFetchMock(async () =>
      Response.json({ message: "boom" }, { status: 500 })
    )

    renderPage(<AdminNamecardAuditPage />, { route: ROUTE })

    expect(await screen.findByText("读取失败")).toBeInTheDocument()
    expect(
      screen.getByText("名片的审计记录无法加载，请稍后重试。")
    ).toBeInTheDocument()
  })
})
