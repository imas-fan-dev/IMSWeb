import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  installFetchMock,
  requestDetails,
} from "@/tests/unit/support/api-client"
import {
  clearCsrfCookie,
  setCsrfCookie,
} from "@/tests/unit/support/auth-cookies"
import { renderPage as renderWithRouter } from "@/tests/unit/support/harness"
import type { AdminSession } from "~/lib/api"
import AdminPlatformUsersPage from "~/pages/admin/platform-users/index"

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const outlet = vi.hoisted(() => ({ session: {} as AdminSession }))

vi.mock("sonner", () => ({ toast: toasts }))

// The page reads its admin session from the layout's outlet context; the shared
// harness only supplies the router, so the context is mocked here.
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>()
  return {
    ...actual,
    useOutletContext: () => ({ adminSession: outlet.session }),
  }
})

const superSession: AdminSession = {
  id: 1,
  username: "admin",
  producername: "Preview Admin",
  dept: "op",
  adminRole: "super_admin",
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "account-1",
    status: "active",
    displayName: "Producer One",
    email: "one@ims.test",
    hasPassword: true,
    activeSessionCount: 2,
    lastLoginAt: 1_000,
    createdAt: 900,
    updatedAt: 1_100,
    ...overrides,
  }
}

function listBody(users: unknown[], pageInfo: Record<string, unknown> = {}) {
  return {
    success: true,
    users,
    pageInfo: {
      page: 1,
      pageSize: 20,
      total: users.length,
      totalPages: users.length ? 1 : 0,
      hasNextPage: false,
      ...pageInfo,
    },
  }
}

function renderPage(
  session: AdminSession = superSession,
  route = "/admin/platform/users"
) {
  outlet.session = session
  renderWithRouter(<AdminPlatformUsersPage />, { route })
}

afterEach(() => {
  vi.clearAllMocks()
  clearCsrfCookie("backoffice")
})

describe("AdminPlatformUsersPage", () => {
  it("blocks regular administrators before loading any user data", () => {
    const fetchMock = installFetchMock()
    renderPage({ ...superSession, id: 2, adminRole: "admin" })

    expect(screen.getByText("仅最高管理员可访问")).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("searches by email and writes the query back into the URL", async () => {
    setCsrfCookie("backoffice", "users-csrf")
    const fetchMock = installFetchMock(async () =>
      Response.json(listBody([user()]))
    )
    renderPage()

    await screen.findByText("Producer One")
    const input = screen.getByPlaceholderText("邮箱、显示名称或用户 ID")
    await userEvent.type(input, "one@ims.test")
    await userEvent.click(screen.getByRole("button", { name: "检索" }))

    await waitFor(() => {
      const last = requestDetails(fetchMock.mock.calls.at(-1) ?? [])
      expect(
        new URL(last.url, "http://ims.test").searchParams.get("query")
      ).toBe("one@ims.test")
    })
  })

  it("disables pagination at the edges and requests the next page", async () => {
    setCsrfCookie("backoffice", "users-csrf")
    const fetchMock = installFetchMock(async (input) => {
      const url = new URL(String(input), "http://ims.test")
      if (url.searchParams.get("page") === "2") {
        return Response.json(
          listBody([user({ id: "account-2", displayName: "Producer Two" })], {
            page: 2,
            total: 3,
            totalPages: 2,
            hasNextPage: false,
          })
        )
      }
      return Response.json(
        listBody([user()], { total: 3, totalPages: 2, hasNextPage: true })
      )
    })
    renderPage()

    await screen.findByText("Producer One")
    const next = screen.getByRole("button", { name: "下一页" })
    expect(next).toBeEnabled()
    await userEvent.click(next)

    await screen.findByText("Producer Two")
    await waitFor(() => expect(next).toBeDisabled())
    expect(
      new URL(
        requestDetails(fetchMock.mock.calls.at(-1) ?? []).url,
        "http://ims.test"
      ).searchParams.get("page")
    ).toBe("2")
  })

  it("shows the matching status action per row and disables reset without a password", async () => {
    installFetchMock(async () =>
      Response.json(
        listBody([
          user({ id: "active-1", displayName: "Active One" }),
          user({
            id: "suspended-1",
            displayName: "Suspended One",
            status: "suspended",
          }),
          user({
            id: "oauth-1",
            displayName: "OAuth Only",
            hasPassword: false,
            email: null,
          }),
        ])
      )
    )
    renderPage()

    await screen.findByText("Active One")
    const activeRow = screen.getByText("Active One").closest("tr")!
    const suspendedRow = screen.getByText("Suspended One").closest("tr")!
    const oauthRow = screen.getByText("OAuth Only").closest("tr")!

    expect(
      within(activeRow).getByRole("button", { name: "禁用" })
    ).toBeEnabled()
    expect(
      within(suspendedRow).getByRole("button", { name: "启用" })
    ).toBeEnabled()
    expect(
      within(oauthRow).getByRole("button", { name: "触发重置" })
    ).toBeDisabled()
    expect(
      within(activeRow).getByRole("button", { name: "触发重置" })
    ).toBeEnabled()
  })

  it("reports the last-credential refusal with its own message", async () => {
    setCsrfCookie("backoffice", "users-csrf")
    installFetchMock(async (input, init) => {
      const url = new URL(String(input), "http://ims.test")
      if (url.pathname.endsWith("/oauth-links/github")) {
        expect(init?.method).toBe("DELETE")
        return Response.json(
          { success: false, code: "PLATFORM_OAUTH_LAST_LOGIN_METHOD" },
          { status: 409 }
        )
      }
      if (url.pathname === "/api/admin/platform/users/account-1") {
        return Response.json({
          success: true,
          user: {
            ...user(),
            oauthLinks: [
              {
                provider: "github",
                providerName: "GitHub",
                enabled: true,
                accountName: "one",
                avatarUrl: null,
                linkedAt: 950,
                removable: true,
              },
            ],
          },
        })
      }
      return Response.json(listBody([user()]))
    })
    renderPage()

    await screen.findByText("Producer One")
    await userEvent.click(screen.getByRole("button", { name: "详情" }))
    await screen.findByText("GitHub")
    await userEvent.click(screen.getByRole("button", { name: "解绑" }))
    await userEvent.click(
      await screen.findByRole("button", { name: "确认解绑" })
    )

    await waitFor(() =>
      expect(toasts.error).toHaveBeenCalledWith(
        "这是该用户唯一可用的登录方式，无法解绑。"
      )
    )
  })
})
