import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter, useLocation } from "react-router"
import { describe, expect, it, vi } from "vitest"

import { AppNavigationProvider } from "~/components/app/app-navigation-provider"
import { AppTopBar } from "~/components/app/app-top-bar"
import { NavigationLink } from "~/components/navigation/navigation-link"
import { i18n } from "~/i18n/config"

vi.mock("~/components/platform/platform-session-provider", () => ({
  usePlatformSession: () => ({ status: "anonymous", session: null }),
}))

vi.mock("~/components/shared/brand-wordmark", () => ({
  BrandWordmark: () => <span>IMSWeb</span>,
}))

vi.mock("~/components/shared/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">切换主题</button>,
}))

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderTopBar(entries: string[]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <AppNavigationProvider>
          <AppTopBar />
          <NavigationLink to="/works/sample">打开详情</NavigationLink>
          <LocationProbe />
        </AppNavigationProvider>
      </MemoryRouter>
    </I18nextProvider>
  )
}

describe("AppTopBar", () => {
  it("keeps theme control on Home without duplicating it on other tab roots", () => {
    const home = renderTopBar(["/"])
    expect(screen.getByRole("button", { name: "切换主题" })).toBeVisible()
    home.unmount()

    renderTopBar(["/account/me"])
    expect(
      screen.queryByRole("button", { name: "切换主题" })
    ).not.toBeInTheDocument()
  })

  it("returns through observed history from a resource detail page", async () => {
    const user = userEvent.setup()
    renderTopBar(["/apps"])
    await user.click(screen.getByRole("link", { name: "打开详情" }))

    expect(screen.getByText("资料", { selector: "p" })).toBeVisible()
    await user.click(screen.getByRole("button", { name: "返回" }))

    expect(screen.getByTestId("location")).toHaveTextContent("/apps")
  })

  it.each([
    ["/account/login", "/account/me", "我的"],
    ["/community/exchange/offices/tokyo", "/community/exchange", "交换地图"],
  ])(
    "returns direct entry %s to its owning root",
    async (href, root, title) => {
      const user = userEvent.setup()
      renderTopBar([href])
      expect(screen.getByText(title, { selector: "p" })).toBeVisible()

      await user.click(screen.getByRole("button", { name: "返回" }))

      expect(screen.getByTestId("location").textContent).toBe(root)
    }
  )
})
