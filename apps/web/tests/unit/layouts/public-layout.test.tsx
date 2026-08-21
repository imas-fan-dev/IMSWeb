import { render, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter, Route, Routes } from "react-router"
import { describe, expect, it, vi } from "vitest"

import { i18n } from "~/i18n/config"
import PublicLayout from "~/layouts/public-layout"

vi.mock("~/components/community/namecard-upload-dialog", () => ({
  NamecardUploadDialog: () => <button type="button">上传名片</button>,
}))

vi.mock("~/components/shared/admin-return-shortcut", () => ({
  AdminReturnShortcut: () => (
    <a href="/admin" data-testid="admin-return-shortcut">
      返回管理工作台
    </a>
  ),
}))

vi.mock("~/components/shared/back-to-top", () => ({
  BackToTop: ({ className }: { className?: string }) => (
    <button type="button" className={className}>
      返回顶部
    </button>
  ),
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
    expect(screen.getByRole("main").parentElement).toHaveClass("z-10")
    expect(
      screen.queryByRole("button", { name: "上传名片" })
    ).not.toBeInTheDocument()
  })

  it.each(["/community/cards", "/community/cards/"])(
    "places the namecard upload action in the shared floating stack for %s",
    (pathname) => {
      render(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={[pathname]}>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route
                  path="community/cards"
                  element={<main>名片墙内容</main>}
                />
              </Route>
            </Routes>
          </MemoryRouter>
        </I18nextProvider>
      )

      const uploadAction = screen.getByRole("button", { name: "上传名片" })
      expect(uploadAction).toBeVisible()
      expect(uploadAction.parentElement).toHaveClass("fixed", "right-4")
    }
  )

  it("keeps modern story floating controls above the site footer", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/story"]}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="story" element={<main>剧情详情</main>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    )

    expect(screen.getByRole("main").parentElement).toHaveClass("z-20")
  })

  it("hides back to top on mobile Wiki catalogs", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/wiki"]}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="wiki" element={<main>Wiki 内容</main>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    )

    expect(screen.getByRole("button", { name: "返回顶部" })).toHaveClass(
      "max-md:hidden"
    )
  })

  it("removes the floating admin shortcut on event detail routes", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/events/42"]}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route
                path="events/:eventId"
                element={<main>活动详情内容</main>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    )

    expect(screen.getByText("活动详情内容")).toBeVisible()
    expect(
      screen.queryByTestId("admin-return-shortcut")
    ).not.toBeInTheDocument()
  })

  it("keeps the floating admin shortcut on other public routes", () => {
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

    expect(screen.getByTestId("admin-return-shortcut")).toBeVisible()
  })
})
