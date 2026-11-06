import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { i18n } from "~/i18n/config"
import { PlatformOAuthAppSection } from "~/pages/account/components/platform-oauth-app-section"
import type { PlatformOAuthAppLogin } from "~/pages/account/components/use-platform-oauth-app-login"

const hookMocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancel: vi.fn(),
  state: undefined as unknown as PlatformOAuthAppLogin,
}))

vi.mock("~/pages/account/components/use-platform-oauth-app-login", () => ({
  usePlatformOAuthAppLogin: () => hookMocks.state,
}))

const providers = [
  {
    code: "github",
    displayName: "GitHub",
    icon: "github",
    buttonColor: "#24292f",
  },
]

function renderSection() {
  return render(
    <I18nextProvider i18n={i18n}>
      <PlatformOAuthAppSection providers={providers} />
    </I18nextProvider>
  )
}

describe("PlatformOAuthAppSection", () => {
  beforeEach(async () => {
    hookMocks.state = {
      status: "idle",
      errorKey: null,
      activeProvider: null,
      start: hookMocks.start,
      cancel: hookMocks.cancel,
    }
    await i18n.changeLanguage("zh-CN")
  })

  it("starts the system-browser flow from a provider button", async () => {
    renderSection()
    const user = userEvent.setup()

    expect(screen.getByText("使用第三方帐号继续")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "GitHub" }))
    expect(hookMocks.start).toHaveBeenCalledWith("github")
  })

  it("shows the waiting state with a cancel action", async () => {
    hookMocks.state = {
      ...hookMocks.state,
      status: "waiting",
      activeProvider: "github",
    }
    renderSection()
    const user = userEvent.setup()

    expect(screen.getByText("等待第三方授权完成…")).toBeVisible()
    expect(screen.getByText("GitHub")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "取消" }))
    expect(hookMocks.cancel).toHaveBeenCalled()
  })

  it("shows the mapped failure reason without leaving the WebView", () => {
    hookMocks.state = {
      ...hookMocks.state,
      status: "error",
      errorKey: "platformAuth.oauth.denied",
    }
    renderSection()

    expect(screen.getByText("你取消了第三方登录。")).toBeVisible()
  })
})
