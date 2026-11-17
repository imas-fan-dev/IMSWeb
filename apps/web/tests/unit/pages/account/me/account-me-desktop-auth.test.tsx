import { screen, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { Route, Routes, useLocation } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { i18n } from "~/i18n/config"
import { AccountMePage } from "~/pages/account/me/account-me-page"
import { renderPage } from "../../../support/harness"

const session = vi.hoisted(() => ({ use: vi.fn() }))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: false }))
vi.mock("~/lib/use-desktop-account-workspace", () => ({
  useDesktopAccountWorkspace: () => true,
}))
vi.mock("~/lib/use-namecard-unread", () => ({ useNamecardUnread: () => 0 }))
vi.mock("~/components/platform/platform-session-provider", () => ({
  usePlatformSession: session.use,
}))
vi.mock("~/pages/account/me/account-me-workspace", () => ({
  AccountMeWorkspace: () => <h1>桌面事务所工作区</h1>,
}))

function LoginDestination() {
  const location = useLocation()
  return (
    <>
      <h1>桌面登录</h1>
      <output data-testid="return-to">
        {new URLSearchParams(location.search).get("returnTo")}
      </output>
    </>
  )
}

function renderDesktop() {
  return renderPage(
    <I18nextProvider i18n={i18n}>
      <Routes>
        <Route
          path="/account/me/offices"
          element={<AccountMePage section="offices" standaloneSection />}
        />
        <Route path="/account/login" element={<LoginDestination />} />
      </Routes>
    </I18nextProvider>,
    { route: "/account/me/offices?create=selected-point#editor" }
  )
}

describe("desktop account authentication boundary", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN")
    session.use.mockReturnValue({ status: "anonymous", session: null })
  })

  it("redirects anonymous desktop visitors without rendering the App account home", async () => {
    renderDesktop()
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "桌面登录" })).toBeVisible()
    )
    expect(screen.getByTestId("return-to")).toHaveTextContent(
      "/account/me/offices?create=selected-point#editor"
    )
    expect(screen.queryByText("偏好与帮助")).not.toBeInTheDocument()
  })

  it.each(["loading", "error"])(
    "does not treat %s as an anonymous session",
    (status) => {
      session.use.mockReturnValue({ status, session: null, reload: vi.fn() })
      renderDesktop()
      expect(
        screen.queryByRole("heading", { name: "桌面登录" })
      ).not.toBeInTheDocument()
      expect(screen.getByRole("main")).toHaveAttribute(
        "data-account-state",
        status
      )
    }
  )

  it.each(["authenticated", "restricted"])(
    "keeps %s accounts in their desktop workspace",
    (status) => {
      session.use.mockReturnValue({
        status,
        session: { profile: { avatarUrl: null } },
      })
      renderDesktop()
      expect(
        screen.getByRole("heading", { name: "桌面事务所工作区" })
      ).toBeVisible()
    }
  )
})
