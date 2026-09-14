import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PlatformAccountMenu } from "~/components/platform/platform-account-menu"
import { i18n } from "~/i18n/config"

const sessionMocks = vi.hoisted(() => ({
  usePlatformSession: vi.fn(),
  acceptSession: vi.fn(),
  acceptProfile: vi.fn(),
  reload: vi.fn(),
  logout: vi.fn(),
}))

const avatarMocks = vi.hoisted(() => ({
  usePlatformAvatarSource: vi.fn(),
}))

vi.mock("~/components/platform/platform-session-provider", () => ({
  usePlatformSession: sessionMocks.usePlatformSession,
}))

vi.mock("~/components/platform/use-platform-avatar-source", () => ({
  usePlatformAvatarSource: avatarMocks.usePlatformAvatarSource,
}))

function renderMenu() {
  return render(
    <MemoryRouter>
      <I18nextProvider i18n={i18n}>
        <PlatformAccountMenu />
      </I18nextProvider>
    </MemoryRouter>
  )
}

function sessionState(
  status: "anonymous" | "loading" | "authenticated" | "restricted" | "error",
  avatarUrl: string | null = "https://images.example.test/avatar.webp"
) {
  return {
    status,
    session:
      status === "authenticated" || status === "restricted"
        ? {
            success: true,
            account: {
              id: "platform-1",
              status: status === "restricted" ? "restricted" : "active",
            },
            profile: {
              displayName: "Platform Producer",
              avatarUrl,
              homeCity: null,
              bio: "",
            },
          }
        : null,
    error: status === "error" ? new Error("offline") : null,
    acceptSession: sessionMocks.acceptSession,
    acceptProfile: sessionMocks.acceptProfile,
    reload: sessionMocks.reload,
    logout: sessionMocks.logout,
  }
}

describe("PlatformAccountMenu", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
      true
    )
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
      1
    )
    avatarMocks.usePlatformAvatarSource.mockImplementation(
      (avatarUrl: string | null | undefined) => avatarUrl
    )
    await i18n.changeLanguage("zh-CN")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("links anonymous visitors to login and registration", async () => {
    sessionMocks.usePlatformSession.mockReturnValue(sessionState("anonymous"))
    renderMenu()

    const trigger = screen.getByRole("button", { name: "帐号：未登录" })
    expect(trigger).toHaveClass("size-9")
    await userEvent.click(trigger)

    expect(screen.getByText("未登录")).toBeVisible()
    expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute(
      "href",
      "/account/login"
    )
    expect(screen.getByRole("link", { name: "注册" })).toHaveAttribute(
      "href",
      "/account/register"
    )
  })

  it("keeps the same trigger size while the session is loading", async () => {
    sessionMocks.usePlatformSession.mockReturnValue(sessionState("loading"))
    renderMenu()

    const trigger = screen.getByRole("button", { name: "帐号状态加载中" })
    expect(trigger).toHaveClass("size-9")
    await userEvent.click(trigger)
    expect(screen.getByText("正在载入帐号")).toBeVisible()
  })

  it("shows the profile and logs out from an authenticated session", async () => {
    sessionMocks.usePlatformSession.mockReturnValue(
      sessionState("authenticated")
    )
    renderMenu()

    const trigger = screen.getByRole("button", {
      name: "帐号：Platform Producer",
    })
    expect(trigger).toHaveClass("size-9")
    await userEvent.click(trigger)

    expect(screen.getByText("Platform Producer")).toBeVisible()
    expect(screen.getByText("已登录")).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "退出帐号" }))
    expect(sessionMocks.logout).toHaveBeenCalledOnce()
  })

  it("shares a refreshed resolved avatar between the trigger and popover", async () => {
    sessionMocks.usePlatformSession.mockReturnValue(
      sessionState("authenticated", null)
    )
    const menu = renderMenu()
    expect(
      menu.container.querySelectorAll('[data-slot="avatar-image"]')
    ).toHaveLength(0)

    const managedUrl = "/api/platform/me/avatar?v=2"
    sessionMocks.usePlatformSession.mockReturnValue(
      sessionState("authenticated", managedUrl)
    )
    avatarMocks.usePlatformAvatarSource.mockReturnValue("blob:managed-avatar")
    menu.rerender(
      <MemoryRouter>
        <I18nextProvider i18n={i18n}>
          <PlatformAccountMenu />
        </I18nextProvider>
      </MemoryRouter>
    )
    await userEvent.click(
      screen.getByRole("button", { name: "帐号：Platform Producer" })
    )

    await vi.waitFor(() => {
      expect(
        document.querySelectorAll('[data-slot="avatar-image"]')
      ).toHaveLength(2)
    })
    const images = document.querySelectorAll('[data-slot="avatar-image"]')
    expect(
      Array.from(images).map((image) => image.getAttribute("src"))
    ).toEqual(["blob:managed-avatar", "blob:managed-avatar"])
    expect(avatarMocks.usePlatformAvatarSource).toHaveBeenLastCalledWith(
      managedUrl,
      "platform-1"
    )
  })

  it("labels restricted sessions without treating them as anonymous", async () => {
    sessionMocks.usePlatformSession.mockReturnValue(sessionState("restricted"))
    renderMenu()

    await userEvent.click(
      screen.getByRole("button", { name: "帐号：Platform Producer（受限）" })
    )
    expect(screen.getByText("帐号受限")).toBeVisible()
    expect(screen.getByRole("button", { name: "退出帐号" })).toBeVisible()
  })

  it("offers a retry command for an unexpected session error", async () => {
    sessionMocks.usePlatformSession.mockReturnValue(sessionState("error"))
    renderMenu()

    await userEvent.click(
      screen.getByRole("button", { name: "帐号状态不可用" })
    )
    expect(screen.getByText("帐号状态不可用")).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "重试" }))
    expect(sessionMocks.reload).toHaveBeenCalledOnce()
  })
})
