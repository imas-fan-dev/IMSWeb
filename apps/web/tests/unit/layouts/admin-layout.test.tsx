import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AdminLayout from "~/layouts/admin-layout"
import { ApiError } from "~/lib/api/api-error"

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

vi.mock("~/lib/api", () => ({
  API_ORIGIN: "",
  PUBLIC_SITE_ORIGIN: "",
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

function renderAdminLayout(initialEntry = "/admin") {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin/login" element={<h1>管理登录路由</h1>} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<h1>管理工作台首页</h1>} />
          <Route path="community" element={<h1>社区配置</h1>} />
          <Route path="community/exchange" element={<h1>位置审核</h1>} />
          <Route path="stories" element={<h1>Wiki 剧情管理</h1>} />
          <Route path="stories/assets" element={<h1>Wiki 素材管理</h1>} />
          <Route path="idols" element={<h1>偶像管理入口</h1>} />
          <Route path="idols/agencies" element={<h1>企划资料</h1>} />
          <Route path="idols/groups" element={<h1>栏目资料</h1>} />
          <Route path="idols/entries" element={<h1>条目资料</h1>} />
          <Route path="cards" element={<h1>名片审核列表</h1>} />
          <Route path="cards/characters" element={<h1>角色列表</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

/** jsdom reports every media query as unmatched, so state the breakpoint. */
function stubNavigationBreakpoint(desktop: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === "(min-width: 1024px)" ? desktop : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
}

describe("AdminLayout", () => {
  beforeEach(() => {
    mocks.onError.mockReturnValue(undefined)
    mocks.send.mockResolvedValue(undefined)
    stubNavigationBreakpoint(true)
  })

  it("opens a navigation group as a menu instead of growing the bar", async () => {
    stubNavigationBreakpoint(false)
    mocks.useRequest.mockReturnValue({
      data: {
        success: true,
        user: {
          id: 3,
          username: "operator",
          producername: "Operator",
          dept: "op",
          adminRole: "admin",
        },
      },
      loading: false,
      error: undefined,
      onError: mocks.onError,
      send: mocks.send,
    })
    const user = userEvent.setup()

    renderAdminLayout("/admin")

    // Narrow screens get a popover list; the bar itself must not grow.
    expect(screen.queryByText("名片审核")).not.toBeInTheDocument()
    const group = screen.getByRole("button", { name: /名片管理/ })
    expect(group).toHaveAttribute("aria-haspopup", "menu")

    await user.click(group)

    expect(
      await screen.findByRole("link", { name: "名片审核" })
    ).toHaveAttribute("href", "/admin/cards")
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
          adminRole: null,
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

  it("allows an editor to use Wiki management without exposing op navigation", () => {
    mocks.useRequest.mockReturnValue({
      data: {
        success: true,
        user: {
          id: 4,
          username: "wiki-editor",
          producername: "Wiki Editor",
          dept: "editor",
          adminRole: null,
        },
      },
      loading: false,
      error: undefined,
      onError: mocks.onError,
      send: mocks.send,
    })

    renderAdminLayout("/admin/stories")

    expect(screen.getByRole("heading", { name: "Wiki 剧情管理" })).toBeVisible()
    expect(screen.getByText("内容编辑")).toBeVisible()
    expect(screen.getByRole("link", { name: /剧情内容/ })).toHaveAttribute(
      "href",
      "/admin/stories"
    )
    expect(
      screen.queryByRole("link", { name: /管理员账号/ })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: /工作台/ })
    ).not.toBeInTheDocument()
  })

  it.each(["/admin/community", "/admin/community/exchange"])(
    "limits editor community access at %s",
    (path) => {
      mocks.useRequest.mockReturnValue({
        data: {
          success: true,
          user: {
            id: 4,
            username: "editor",
            producername: "Editor",
            dept: "editor",
            adminRole: null,
          },
        },
        loading: false,
        error: undefined,
        onError: mocks.onError,
        send: mocks.send,
      })
      renderAdminLayout(path)
      if (path === "/admin/community") {
        expect(screen.getByRole("heading", { name: "社区配置" })).toBeVisible()
        expect(
          screen.getByRole("link", { name: /制作人社区/ })
        ).toHaveAttribute("href", "/admin/community")
        expect(
          screen.queryByRole("link", { name: /事务所位置/ })
        ).not.toBeInTheDocument()
      } else
        expect(
          screen.getByRole("heading", { name: "无法访问管理工作台" })
        ).toBeVisible()
    }
  )

  it.each(["editor", "op"])(
    "keeps %s access to the independent catalog",
    (dept) => {
      mocks.useRequest.mockReturnValue({
        data: {
          success: true,
          user: {
            id: 4,
            username: "editor",
            producername: "Editor",
            dept,
            adminRole: null,
          },
        },
        loading: false,
        error: undefined,
        onError: mocks.onError,
        send: mocks.send,
      })
      renderAdminLayout("/admin/idols/entries")
      expect(screen.getByRole("heading", { name: "条目资料" })).toBeVisible()
      expect(screen.getByRole("link", { name: "条目管理" })).toHaveAttribute(
        "aria-current",
        "page"
      )
      expect(screen.getByRole("link", { name: "企划管理" })).toHaveAttribute(
        "href",
        "/admin/idols/agencies"
      )
    }
  )

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

  it("hides account management from a regular administrator", () => {
    mocks.useRequest.mockReturnValue({
      data: {
        success: true,
        user: {
          id: 3,
          username: "operator",
          producername: "Operator",
          dept: "op",
          adminRole: "admin",
        },
      },
      loading: false,
      error: undefined,
      onError: mocks.onError,
      send: mocks.send,
    })

    renderAdminLayout()

    expect(screen.getByText("一般管理员")).toBeVisible()
    expect(
      screen.queryByRole("link", { name: /管理员账号/ })
    ).not.toBeInTheDocument()
  })

  it("shows account management to the super administrator", () => {
    mocks.useRequest.mockReturnValue({
      data: {
        success: true,
        user: {
          id: 1,
          username: "super-operator",
          producername: "Super Operator",
          dept: "op",
          adminRole: "super_admin",
        },
      },
      loading: false,
      error: undefined,
      onError: mocks.onError,
      send: mocks.send,
    })

    renderAdminLayout()

    expect(screen.getByText("最高管理员")).toBeVisible()
    expect(screen.getByRole("link", { name: /管理员账号/ })).toHaveAttribute(
      "href",
      "/admin/accounts"
    )
  })

  it("links back to the public site and collapses the desktop sidebar", async () => {
    mocks.useRequest.mockReturnValue({
      data: {
        success: true,
        user: {
          id: 3,
          username: "operator",
          producername: "Operator",
          dept: "op",
          adminRole: "admin",
        },
      },
      loading: false,
      error: undefined,
      onError: mocks.onError,
      send: mocks.send,
    })
    const user = userEvent.setup()

    renderAdminLayout()

    expect(screen.getByRole("link", { name: "返回主站" })).toHaveAttribute(
      "href",
      "/"
    )
    const sidebar = screen.getByLabelText("管理业务").closest("aside")
    const collapseButton = screen.getByRole("button", { name: "收起侧栏" })

    expect(sidebar).toHaveAttribute("data-collapsed", "false")
    expect(collapseButton).toHaveAttribute("aria-expanded", "true")

    await user.click(collapseButton)

    expect(sidebar).toHaveAttribute("data-collapsed", "true")
    expect(screen.getByRole("button", { name: "展开侧栏" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
    expect(screen.getByRole("link", { name: /剧情内容/ })).toHaveAttribute(
      "href",
      "/admin/stories"
    )
  })

  it("keeps the card group open on a child route and expands it on hover", async () => {
    mocks.useRequest.mockReturnValue({
      data: {
        success: true,
        user: {
          id: 3,
          username: "operator",
          producername: "Operator",
          dept: "op",
          adminRole: "admin",
        },
      },
      loading: false,
      error: undefined,
      onError: mocks.onError,
      send: mocks.send,
    })
    const user = userEvent.setup()

    renderAdminLayout("/admin/cards")

    const group = screen.getByRole("button", { name: /名片管理/ })

    expect(group).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("link", { name: "名片审核" })).toHaveAttribute(
      "href",
      "/admin/cards"
    )
    expect(screen.getByText("信息修改")).toHaveAttribute(
      "aria-disabled",
      "true"
    )
    expect(
      screen.queryByRole("link", { name: "信息修改" })
    ).not.toBeInTheDocument()

    await user.unhover(group)
    await user.hover(group)

    expect(group).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("标签管理")).toBeVisible()
  })

  it("marks only the matching card child as current", () => {
    mocks.useRequest.mockReturnValue({
      data: {
        success: true,
        user: {
          id: 3,
          username: "operator",
          producername: "Operator",
          dept: "op",
          adminRole: "admin",
        },
      },
      loading: false,
      error: undefined,
      onError: mocks.onError,
      send: mocks.send,
    })

    renderAdminLayout("/admin/cards/characters")

    // 名片审核 is an exact match, so a deeper sibling must not light it up.
    expect(screen.getByRole("link", { name: "名片审核" })).not.toHaveAttribute(
      "aria-current"
    )
    expect(screen.getByRole("link", { name: "角色列表" })).toHaveAttribute(
      "aria-current",
      "page"
    )
  })

  it("collapses the card group away from its routes until it is hovered", async () => {
    mocks.useRequest.mockReturnValue({
      data: {
        success: true,
        user: {
          id: 3,
          username: "operator",
          producername: "Operator",
          dept: "op",
          adminRole: "admin",
        },
      },
      loading: false,
      error: undefined,
      onError: mocks.onError,
      send: mocks.send,
    })
    const user = userEvent.setup()

    renderAdminLayout()

    const group = screen.getByRole("button", { name: /名片管理/ })

    expect(group).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("名片审核")).not.toBeInTheDocument()

    await user.hover(group)

    expect(group).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("link", { name: "名片审核" })).toBeVisible()

    await user.unhover(group)

    expect(group).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("名片审核")).not.toBeInTheDocument()
  })
})
