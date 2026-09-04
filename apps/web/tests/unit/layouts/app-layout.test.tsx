import { render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import type { ReactNode } from "react"
import { MemoryRouter, Route, Routes } from "react-router"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "~/i18n/config"
import AppLayout from "~/layouts/app-layout"

vi.mock("~/components/app/app-cold-start-mask", () => ({
  AppColdStartMask: () => null,
}))

vi.mock("~/components/app/app-tab-bar", () => ({
  APP_TAB_BAR_CLEARANCE: "pb-app-tab-bar",
  AppTabBar: () => <nav aria-label="App 导航" />,
}))

vi.mock("~/components/community/namecard-upload-dialog", () => ({
  NamecardUploadDialog: () => null,
}))

vi.mock("~/components/platform/platform-session-provider", () => ({
  PlatformSessionProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="platform-session-boundary">{children}</div>
  ),
}))

vi.mock("~/components/shared/back-to-top", () => ({
  BackToTop: () => null,
}))

vi.mock("~/components/shared/brand-wordmark", () => ({
  BrandWordmark: () => <span>偶像大师交流站</span>,
}))

vi.mock("~/components/shared/series-icon-background", () => ({
  SeriesIconBackground: () => null,
}))

vi.mock("~/components/shared/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">切换主题</button>,
}))

describe("AppLayout", () => {
  it("keeps the top bar in flow while making it sticky below the safe area", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/events"]}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="events" element={<main>活动中心内容</main>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    )

    const shell = screen.getByTestId(
      "platform-session-boundary"
    ).firstElementChild
    const header = screen.getByRole("banner")

    expect(shell).not.toHaveClass("pt-[calc(3rem+env(safe-area-inset-top))]")
    expect(header).toHaveClass(
      "sticky",
      "top-0",
      "shrink-0",
      "pt-(--safe-area-top)"
    )
    expect(shell).toHaveAttribute("data-app-shell")
    expect(shell).not.toHaveAttribute("data-app-immersive")
    expect(document.documentElement).not.toHaveAttribute("data-app-immersive")
    expect(screen.getByText("社区动态", { selector: "p" })).toBeVisible()
    expect(header).not.toHaveClass("fixed", "inset-x-0")
    expect(screen.getByText("活动中心内容")).toBeVisible()
    expect(screen.getByText("跳到主要内容")).toHaveClass(
      "top-[calc(0.5rem+var(--safe-area-top))]",
      "translate-y-[calc(-100%-var(--safe-area-top)-0.5rem)]",
      "focus-visible:translate-y-0"
    )
    expect(screen.getByText("跳到主要内容")).not.toHaveClass(
      "focus:translate-y-0"
    )
  })

  it("removes the global header from the full-screen exchange map", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/community/exchange"]}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route
                path="community/exchange"
                element={<main>交换地图内容</main>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    )

    const content = screen.getByText("交换地图内容")
    const shell = screen.getByTestId(
      "platform-session-boundary"
    ).firstElementChild

    expect(screen.queryByRole("banner")).not.toBeInTheDocument()
    expect(screen.queryByText("偶像大师交流站")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "切换主题" })
    ).not.toBeInTheDocument()
    expect(shell).toHaveClass("h-dvh", "overflow-hidden")
    expect(shell).toHaveAttribute("data-app-shell")
    expect(shell).toHaveAttribute("data-app-immersive")
    expect(document.documentElement).toHaveAttribute("data-app-immersive")
    expect(content.parentElement).toHaveClass("bg-background")
    expect(content.parentElement).not.toHaveClass(
      "pt-[env(safe-area-inset-top)]"
    )
    expect(screen.getByRole("navigation", { name: "App 导航" })).toBeVisible()
  })
})
