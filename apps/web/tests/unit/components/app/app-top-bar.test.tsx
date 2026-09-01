import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter, useLocation } from "react-router"
import { describe, expect, it, vi } from "vitest"

import { AppTopBar } from "~/components/app/app-top-bar"
import { i18n } from "~/i18n/config"

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
        <AppTopBar />
        <LocationProbe />
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

  it("returns through router history from an Apps detail page", async () => {
    const user = userEvent.setup()
    renderTopBar(["/apps", "/works/sample"])

    expect(screen.getByText("站内应用", { selector: "p" })).toBeVisible()
    await user.click(screen.getByRole("button", { name: "返回" }))

    expect(screen.getByTestId("location")).toHaveTextContent("/apps")
  })

  it("falls back to the owning tab root for an initial deep link", async () => {
    const user = userEvent.setup()
    renderTopBar(["/account/login"])

    await user.click(screen.getByRole("button", { name: "返回" }))

    expect(screen.getByTestId("location")).toHaveTextContent("/account/me")
  })
})
