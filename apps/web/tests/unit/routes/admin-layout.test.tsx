import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AdminLayout from "~/routes/admin-layout"
import { ApiError } from "~/shared/api/api-error"

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(() => ({ id: "admin-session-method" })),
  logoutAdmin: vi.fn(),
  onError: vi.fn(),
  send: vi.fn(),
  useRequest: vi.fn(),
}))

vi.mock("alova/client", () => ({
  useRequest: mocks.useRequest,
}))

vi.mock("~/shared/api", () => ({
  getAdminSession: mocks.getAdminSession,
  isApiError: (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ApiError",
  logoutAdmin: mocks.logoutAdmin,
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}))

function renderAdminLayout() {
  render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Routes>
        <Route path="/admin/login" element={<h1>管理登录路由</h1>} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<h1>管理工作台首页</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe("AdminLayout", () => {
  beforeEach(() => {
    mocks.onError.mockReturnValue(undefined)
    mocks.send.mockResolvedValue(undefined)
  })

  it("does not render the admin shell for a signed-in non-op user", () => {
    mocks.useRequest.mockReturnValue({
      data: {
        success: true,
        user: {
          id: 2,
          username: "reader",
          producername: "Reader",
          dept: "user",
        },
      },
      loading: false,
      error: undefined,
      onError: mocks.onError,
      send: mocks.send,
    })

    renderAdminLayout()

    expect(
      screen.getByRole("heading", { name: "无法访问管理工作台" })
    ).toBeVisible()
    expect(screen.queryByLabelText("管理业务")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "切换管理账号" })
    ).toHaveAttribute("href", "/admin/login")
  })

  it("shows a retryable state for a session service failure", async () => {
    mocks.useRequest.mockReturnValue({
      data: undefined,
      loading: false,
      error: new ApiError("网络请求失败", {
        kind: "network",
      }),
      onError: mocks.onError,
      send: mocks.send,
    })
    const user = userEvent.setup()

    renderAdminLayout()
    await user.click(screen.getByRole("button", { name: "重新验证" }))

    expect(
      screen.getByRole("heading", { name: "无法验证管理会话" })
    ).toBeVisible()
    expect(mocks.send).toHaveBeenCalledOnce()
  })

  it("redirects an expired session to the login route", () => {
    mocks.useRequest.mockReturnValue({
      data: undefined,
      loading: false,
      error: new ApiError("token无效", { kind: "http", status: 401 }),
      onError: mocks.onError,
      send: mocks.send,
    })

    renderAdminLayout()

    expect(screen.getByRole("heading", { name: "管理登录路由" })).toBeVisible()
  })
})
