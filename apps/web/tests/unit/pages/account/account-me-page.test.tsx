import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "~/i18n/config"
import AccountMePage from "~/pages/account/me/account-me-page"

const sessionMocks = vi.hoisted(() => ({
  logout: vi.fn(),
  reload: vi.fn(),
  usePlatformSession: vi.fn(),
}))

vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))

vi.mock("~/components/platform/platform-session-provider", () => ({
  usePlatformSession: sessionMocks.usePlatformSession,
}))

vi.mock("~/components/shared/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">切换主题</button>,
}))

const activeSession = {
  success: true as const,
  account: { id: "platform-1", status: "active" as const },
  profile: {
    displayName: "测试制作人",
    avatarUrl: "/avatar.webp",
    homeCity: "上海",
    bio: "",
  },
}

function sessionState(
  status: "anonymous" | "loading" | "authenticated" | "restricted" | "error"
) {
  return {
    status,
    session:
      status === "authenticated"
        ? activeSession
        : status === "restricted"
          ? {
              ...activeSession,
              account: {
                ...activeSession.account,
                status: "restricted" as const,
              },
            }
          : null,
    error: status === "error" ? new Error("session unavailable") : null,
    acceptSession: vi.fn(),
    reload: sessionMocks.reload,
    logout: sessionMocks.logout,
  }
}

function TestPage() {
  return (
    <MemoryRouter>
      <I18nextProvider i18n={i18n}>
        <AccountMePage />
      </I18nextProvider>
    </MemoryRouter>
  )
}

function renderPage() {
  return render(<TestPage />)
}

describe("AccountMePage", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    sessionMocks.reload.mockResolvedValue(undefined)
    sessionMocks.logout.mockResolvedValue(undefined)
    await i18n.changeLanguage("zh-CN")
  })

  it("shows a fixed account skeleton while the session is loading", () => {
    sessionMocks.usePlatformSession.mockReturnValue(sessionState("loading"))
    const { container } = renderPage()

    const main = screen.getByRole("main", { name: "帐号状态加载中" })
    expect(main).toHaveAttribute("data-account-state", "loading")
    expect(main).toHaveAttribute("aria-busy", "true")
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(9)
  })

  it("keeps all anonymous account and preference destinations reachable", () => {
    sessionMocks.usePlatformSession.mockReturnValue(sessionState("anonymous"))
    renderPage()

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-account-state",
      "anonymous"
    )
    expect(screen.getByRole("button", { name: "登录" })).toHaveAttribute(
      "href",
      "/account/login"
    )
    expect(screen.getByRole("button", { name: "注册" })).toHaveAttribute(
      "href",
      "/account/register"
    )
    expect(screen.getByRole("link", { name: "忘记密码？" })).toHaveAttribute(
      "href",
      "/account/password-reset"
    )
    expect(screen.getByRole("button", { name: "切换主题" })).toBeVisible()
    expect(screen.getByRole("link", { name: "关于" })).toHaveAttribute(
      "href",
      "/about"
    )
  })

  it("retries an account state error in place", async () => {
    sessionMocks.usePlatformSession.mockReturnValue(sessionState("error"))
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-account-state",
      "error"
    )
    await user.click(screen.getByRole("button", { name: "重试" }))
    expect(sessionMocks.reload).toHaveBeenCalledOnce()
  })

  it("shows identity details, business links, and pending and success logout feedback", async () => {
    sessionMocks.usePlatformSession.mockReturnValue(
      sessionState("authenticated")
    )
    const user = userEvent.setup()
    const rendered = renderPage()

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-account-state",
      "authenticated"
    )
    expect(screen.getByText("测试制作人")).toBeVisible()
    expect(screen.getByText("上海")).toBeVisible()
    expect(screen.getByText("已登录")).toBeVisible()

    const expectedSections = [
      ["个人资料", "/account/me/profile"],
      ["交换名片", "/account/me/cards"],
      ["收藏夹", "/account/me/favorites"],
      ["事务所与位置", "/account/me/offices"],
      ["认领消息", "/account/me/claims"],
    ] as const
    const links = screen.getAllByRole("link")
    for (const [name, href] of expectedSections) {
      const link = links.find((item) => item.getAttribute("href") === href)
      expect(link).toHaveTextContent(name)
    }

    await user.click(screen.getByRole("button", { name: "退出帐号" }))
    expect(screen.getByRole("button", { name: "正在退出帐号" })).toBeDisabled()

    sessionMocks.usePlatformSession.mockReturnValue(sessionState("anonymous"))
    rendered.rerender(<TestPage />)
    expect(await screen.findByText("已退出帐号")).toBeVisible()
  })

  it("keeps a restricted account visibly read-only", () => {
    sessionMocks.usePlatformSession.mockReturnValue(sessionState("restricted"))
    renderPage()

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-account-state",
      "restricted"
    )
    expect(screen.getByText("帐号受限")).toBeVisible()
    expect(screen.getByText("帐号当前为只读")).toBeVisible()
    expect(screen.getByText(/仍可查看，但不能修改/)).toBeVisible()
  })

  it("shows a retry action when logout rejects before the provider updates", async () => {
    sessionMocks.logout.mockRejectedValue(new Error("offline"))
    sessionMocks.usePlatformSession.mockReturnValue(
      sessionState("authenticated")
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole("button", { name: "退出帐号" }))
    await waitFor(() => {
      expect(screen.getByText("退出帐号失败")).toBeVisible()
    })
    expect(screen.getByRole("button", { name: "重试退出" })).toBeVisible()
  })
})
