import { render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter, Route, Routes } from "react-router"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "~/i18n/config"
import PublicLayout from "~/layouts/public-layout"

vi.mock("~/components/shared/admin-return-shortcut", () => ({
  AdminReturnShortcut: () => null,
}))

vi.mock("~/components/shared/back-to-top", () => ({
  BackToTop: () => <button type="button">返回顶部</button>,
}))

vi.mock("~/components/shared/series-icon-background", () => ({
  SeriesIconBackground: () => <div data-testid="series-icon-background" />,
}))

vi.mock("~/components/shared/site-footer", () => ({
  SiteFooter: () => <footer>站点页脚</footer>,
}))

vi.mock("~/components/shared/site-header", () => ({
  SiteHeader: () => <header>站点导航</header>,
}))

describe("PublicLayout", () => {
  it("shares one animated series background across public routes", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/events"]}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="events" element={<main>活动中心内容</main>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    )

    expect(screen.getAllByTestId("series-icon-background")).toHaveLength(1)
    expect(screen.getByText("活动中心内容")).toBeVisible()
    expect(screen.getByText("站点导航")).toBeVisible()
    expect(screen.getByText("站点页脚")).toBeVisible()
    expect(screen.getByRole("button", { name: "返回顶部" })).toBeVisible()
  })
})
