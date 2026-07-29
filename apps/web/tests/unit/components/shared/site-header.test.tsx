import { act, render, screen, within } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter } from "react-router"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SiteHeader } from "~/components/shared/site-header"
import { i18n } from "~/i18n/config"
import { defaultLanguage, defaultNamespace } from "~/i18n/resources"

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}))

function TestProviders({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n} defaultNS={defaultNamespace}>
      <MemoryRouter>{children}</MemoryRouter>
    </I18nextProvider>
  )
}

describe("SiteHeader", () => {
  beforeEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it("keeps the Wiki action concise across languages", async () => {
    render(<SiteHeader />, { wrapper: TestProviders })

    const wikiLink = screen.getByRole("link", { name: "Wiki" })
    expect(wikiLink).toHaveAttribute("href", "/wiki")
    expect(wikiLink.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
    expect(screen.queryByText("进入资料库")).not.toBeInTheDocument()

    await act(() => i18n.changeLanguage("en"))

    expect(screen.getByRole("link", { name: "Wiki" })).toBe(wikiLink)
    expect(screen.queryByText("Open knowledge base")).not.toBeInTheDocument()
  })

  it("keeps only primary destinations in the global navigation", () => {
    render(<SiteHeader />, { wrapper: TestProviders })

    const navigation = screen.getByRole("navigation", { name: "主导航" })
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent)
    ).toEqual(["首页", "活动", "推荐", "Live", "社区"])

    for (const secondaryLabel of ["名片墙", "地图", "作品", "编年史", "关于"]) {
      expect(
        within(navigation).queryByRole("link", { name: secondaryLabel })
      ).not.toBeInTheDocument()
    }
  })
})
