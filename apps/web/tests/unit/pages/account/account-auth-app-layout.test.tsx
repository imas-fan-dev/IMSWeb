import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "~/i18n/config"
import AccountLoginPage from "~/pages/account/login/account-login-page"
import AccountRegisterPage from "~/pages/account/register/account-register-page"
import AccountPasswordResetPage from "~/pages/account/reset/account-password-reset-page"

const apiMocks = vi.hoisted(() => ({
  getPlatformOAuthProviders: vi.fn(),
  loginPlatform: vi.fn(),
  loginSend: vi.fn(),
}))

const sessionMocks = vi.hoisted(() => ({
  acceptSession: vi.fn(),
  usePlatformSession: vi.fn(),
}))

vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getPlatformOAuthProviders: apiMocks.getPlatformOAuthProviders,
    loginPlatform: apiMocks.loginPlatform,
  }
})

vi.mock("~/components/platform/platform-session-provider", () => ({
  usePlatformSession: sessionMocks.usePlatformSession,
}))

const pages = [
  {
    path: "/account/login",
    title: "登录站点帐号",
    Page: AccountLoginPage,
  },
  {
    path: "/account/register",
    title: "注册站点帐号",
    Page: AccountRegisterPage,
  },
  {
    path: "/account/password-reset",
    title: "找回帐号密码",
    Page: AccountPasswordResetPage,
  },
] as const

describe("App account auth layout", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    apiMocks.loginPlatform.mockReturnValue({ send: apiMocks.loginSend })
    sessionMocks.usePlatformSession.mockReturnValue({
      status: "anonymous",
      session: null,
      error: null,
      acceptSession: sessionMocks.acceptSession,
      reload: vi.fn(),
      logout: vi.fn(),
    })
    await i18n.changeLanguage("zh-CN")
  })

  it.each(pages)(
    "renders $path as a compact single-column form",
    ({ path, title, Page }) => {
      const { container } = render(
        <MemoryRouter initialEntries={[path]}>
          <I18nextProvider i18n={i18n}>
            <Routes>
              <Route path={path} element={<Page />} />
            </Routes>
          </I18nextProvider>
        </MemoryRouter>
      )

      expect(screen.getByRole("heading", { name: title })).toBeVisible()
      const layout = container.querySelector('[data-account-auth-layout="app"]')
      expect(layout).toHaveClass("max-w-md")
      expect(layout).not.toHaveClass("grid")
      expect(container.querySelector("aside")).not.toBeInTheDocument()
      expect(container.querySelector("main")).toHaveClass(
        "min-h-(--app-content-height)",
        "pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      )
      expect(container.querySelector("[autofocus]")).not.toBeInTheDocument()
    }
  )

  it("enters the App account root after a successful login", async () => {
    apiMocks.loginSend.mockResolvedValue({
      success: true,
      account: { id: "platform-app", status: "active" },
      profile: {
        displayName: "App 制作人",
        avatarUrl: null,
        homeCity: null,
        bio: "",
      },
    })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={["/account/login"]}>
        <I18nextProvider i18n={i18n}>
          <Routes>
            <Route path="/account/login" element={<AccountLoginPage />} />
            <Route path="/account/me" element={<h1>帐号首页</h1>} />
          </Routes>
        </I18nextProvider>
      </MemoryRouter>
    )

    await user.type(screen.getByLabelText("邮箱"), "app@example.com")
    await user.type(
      screen.getByLabelText("密码", { exact: true }),
      "correct-horse-battery"
    )
    await user.click(screen.getByRole("button", { name: "登录" }))

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "帐号首页" })).toBeVisible()
    })
  })

  it("does not request or render OAuth providers in the App target", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/account/login"]}>
        <I18nextProvider i18n={i18n}>
          <Routes>
            <Route path="/account/login" element={<AccountLoginPage />} />
          </Routes>
        </I18nextProvider>
      </MemoryRouter>
    )

    expect(apiMocks.getPlatformOAuthProviders).not.toHaveBeenCalled()
    expect(container).not.toHaveTextContent("使用第三方帐号继续")
  })
})
