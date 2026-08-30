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
      "pt-[env(safe-area-inset-top)]"
    )
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
})
