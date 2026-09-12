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
  NamecardUploadDialog: () => <input aria-label="Upload draft" />,
}))

vi.mock("~/components/platform/platform-session-provider", () => ({
  PlatformSessionProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="platform-session-boundary">{children}</div>
  ),
}))

vi.mock("~/components/shared/back-to-top", () => ({
  BackToTop: () => <button type="button">Back to top</button>,
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

function layoutWithPagination(entry: string, visible: boolean) {
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route
              path="*"
              element={
                <nav
                  aria-label="Namecard pagination"
                  data-namecard-pagination-visible={visible ? "" : undefined}
                />
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nextProvider>
  )
}

describe("AppLayout", () => {
  it.each(["/community/cards", "/community/cards/"])(
    "scopes floating-action yielding to the namecard pagination on %s without remounting upload",
    (entry) => {
      const { rerender } = render(layoutWithPagination(entry, false))
      const upload = screen.getByRole("textbox", { name: "Upload draft" })
      const actions = upload.closest("[data-app-floating-actions]")
      expect(actions).toHaveClass(
        "fixed",
        "bottom-[var(--app-floating-bottom)]",
        "group-has-data-namecard-pagination-visible/app-shell:hidden"
      )
      expect(actions?.closest("[data-app-shell]")).toHaveClass(
        "group/app-shell"
      )
      expect(
        screen.getByRole("button", { name: "Back to top" }).parentElement
      ).toBe(actions)

      rerender(layoutWithPagination(entry, true))
      expect(
        screen.getByRole("navigation", { name: "Namecard pagination" })
      ).toHaveAttribute("data-namecard-pagination-visible")
      expect(screen.getByRole("textbox", { name: "Upload draft" })).toBe(upload)
      rerender(layoutWithPagination(entry, false))
      expect(screen.getByRole("textbox", { name: "Upload draft" })).toBe(upload)
      expect(
        screen.getByRole("navigation", { name: "Namecard pagination" })
      ).not.toHaveAttribute("data-namecard-pagination-visible")
    }
  )

  it("does not apply the namecard visibility rule to another route", () => {
    render(layoutWithPagination("/events", true))
    const actions = screen
      .getByRole("button", { name: "Back to top" })
      .closest("[data-app-floating-actions]")
    expect(actions).toHaveClass("fixed", "bottom-[var(--app-floating-bottom)]")
    expect(actions).not.toHaveClass(
      "group-has-data-namecard-pagination-visible/app-shell:hidden"
    )
    expect(
      screen.queryByRole("textbox", { name: "Upload draft" })
    ).not.toBeInTheDocument()
  })

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
