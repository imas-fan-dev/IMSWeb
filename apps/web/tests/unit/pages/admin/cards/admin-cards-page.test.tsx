import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  installFetchMock,
  requestDetails,
} from "@/tests/unit/support/api-client"
import { clearCsrfCookie } from "@/tests/unit/support/auth-cookies"
import { renderPage } from "@/tests/unit/support/harness"
import AdminCardsPage from "~/pages/admin/cards"

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock("sonner", () => ({ toast: toasts }))

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: 793,
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

function cardsBody(data: unknown[]) {
  return Response.json({
    success: true,
    data,
    pageInfo: {
      page: 1,
      pageSize: 10,
      total: data.length,
      totalPages: 1,
      hasNextPage: false,
    },
  })
}

function usersBody() {
  return Response.json({
    success: true,
    users: [
      {
        id: "account-1",
        status: "active",
        displayName: "Producer One",
        uid: 1,
        pageSlug: null,
        email: null,
        hasPassword: false,
        activeSessionCount: 0,
        lastLoginAt: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    pageInfo: {
      page: 1,
      pageSize: 6,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
    },
  })
}

afterEach(() => {
  vi.clearAllMocks()
  clearCsrfCookie("backoffice")
})

describe("AdminCardsPage owner filter", () => {
  it("narrows the review queue by the owning account picked from the user search", async () => {
    const fetchMock = installFetchMock(async (input) => {
      const url = new URL(String(input), "http://x")
      if (url.pathname.endsWith("/platform/users")) return usersBody()
      return cardsBody([card()])
    })
    const listCalls = () =>
      fetchMock.mock.calls
        .map((call) => new URL(requestDetails(call).url, "http://x"))
        .filter((url) => url.pathname === "/api/admin/cards")
    const user = userEvent.setup()

    renderPage(<AdminCardsPage />, { route: "/admin/cards" })
    await screen.findByText("名片队列")

    // 控件落位：制作人名称 → 所属用户 → 审核状态。
    const [nameField, ownerField, statusField] = [
      "制作人名称",
      "所属用户",
      "审核状态",
    ].map((label) => screen.getByText(label))
    expect(nameField!.compareDocumentPosition(ownerField!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(ownerField!.compareDocumentPosition(statusField!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )

    await user.type(screen.getByPlaceholderText("按昵称检索用户"), "Producer")
    await user.click(await screen.findByRole("button", { name: /Producer One/ }))

    await waitFor(() => {
      expect(listCalls().at(-1)!.searchParams.get("owner")).toBe("account-1")
    })
    expect(screen.getByText("Producer One")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "取消所属用户筛选" }))
    await waitFor(() => {
      expect(listCalls().at(-1)!.searchParams.get("owner")).toBeNull()
    })
  })
})
