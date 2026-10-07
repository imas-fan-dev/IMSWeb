import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Route, Routes, useLocation } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "~/i18n/config"
import AccountLoginPage from "~/pages/account/login/account-login-page"

import { I18nTestProvider, renderPage } from "../../support/harness"

const apiMocks = vi.hoisted(() => ({
  oauthSend: vi.fn(),
  loginPlatform: vi.fn(),
  loginSend: vi.fn(),
}))

const sessionMocks = vi.hoisted(() => ({
  acceptSession: vi.fn(),
  usePlatformSession: vi.fn(),
}))

vi.mock("~/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/api")>()
  return {
    ...actual,
    getPlatformOAuthProviders: () => ({ send: apiMocks.oauthSend }),
    loginPlatform: apiMocks.loginPlatform,
  }
})

vi.mock("~/components/platform/platform-session-provider", () => ({
  usePlatformSession: sessionMocks.usePlatformSession,
}))

const provider = {
  code: "github",
  displayName: "GitHub",
  icon: "github",
  buttonColor: "#24292f",
}

const EMAIL_DRAFT_KEY = "ims.platform.email-draft"

function anonymousState() {
  return {
    status: "anonymous",
    session: null,
    error: null,
    acceptSession: sessionMocks.acceptSession,
    reload: vi.fn(),
    logout: vi.fn(),
  }
}

function SearchProbe() {
  const location = useLocation()
  return <div data-testid="search">{location.search}</div>
}

function renderLogin(entry = "/account/login") {
  return renderPage(
    <I18nTestProvider>
      <Routes>
        <Route
          path="/account/login"
          element={
            <>
              <AccountLoginPage />
              <SearchProbe />
            </>
          }
        />
      </Routes>
    </I18nTestProvider>,
    { route: entry }
  )
}

describe("Mobile Web OAuth degradation", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    sessionMocks.usePlatformSession.mockReturnValue(anonymousState())
    apiMocks.loginPlatform.mockReturnValue({ send: apiMocks.loginSend })
    await i18n.changeLanguage("zh-CN")
  })

  it("shows a retryable failure state instead of silently hiding the entry", async () => {
    apiMocks.oauthSend
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ providers: [provider] })
    renderLogin()

    expect(
      await screen.findByText("第三方登录列表载入失败，请重试。")
    ).toBeVisible()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "重试" }))

    expect(await screen.findByText("使用第三方帐号继续")).toBeVisible()
    expect(await screen.findByRole("link", { name: "GitHub" })).toBeVisible()
    expect(apiMocks.oauthSend).toHaveBeenCalledTimes(2)
  })

  it("renders the failure reason from ?oauth= and drops the parameter", async () => {
    apiMocks.oauthSend.mockResolvedValue({ providers: [] })
    renderLogin("/account/login?oauth=denied")

    expect(await screen.findByText("你取消了第三方登录。")).toBeVisible()
    await waitFor(() => {
      expect(screen.getByTestId("search").textContent).toBe("")
    })
    // The message is captured once; the URL no longer carries the reason.
    expect(screen.getByText("你取消了第三方登录。")).toBeVisible()
  })

  it("maps an expired round trip to its own reason", async () => {
    apiMocks.oauthSend.mockResolvedValue({ providers: [] })
    renderLogin("/account/login?oauth=expired")

    expect(
      await screen.findByText("登录链接已过期，请重新尝试。")
    ).toBeVisible()
  })

  it("restores the email draft typed before a whole-page OAuth jump", async () => {
    apiMocks.oauthSend.mockResolvedValue({ providers: [] })
    window.sessionStorage.setItem(EMAIL_DRAFT_KEY, "draft@example.com")
    renderLogin()

    expect(screen.getByLabelText("邮箱")).toHaveValue("draft@example.com")

    const user = userEvent.setup()
    await user.clear(screen.getByLabelText("邮箱"))
    await user.type(screen.getByLabelText("邮箱"), "next@example.com")
    expect(window.sessionStorage.getItem(EMAIL_DRAFT_KEY)).toBe(
      "next@example.com"
    )
  })

  it("clears the email draft once a session exists", () => {
    apiMocks.oauthSend.mockResolvedValue({ providers: [] })
    window.sessionStorage.setItem(EMAIL_DRAFT_KEY, "draft@example.com")
    sessionMocks.usePlatformSession.mockReturnValue({
      status: "authenticated",
      session: {
        success: true,
        account: { id: "platform-1", status: "active" },
        profile: {
          displayName: "Producer",
          avatarUrl: null,
          homeCity: null,
          bio: "",
        },
      },
      error: null,
      acceptSession: sessionMocks.acceptSession,
      reload: vi.fn(),
      logout: vi.fn(),
    })

    renderLogin()

    expect(window.sessionStorage.getItem(EMAIL_DRAFT_KEY)).toBeNull()
  })
})
