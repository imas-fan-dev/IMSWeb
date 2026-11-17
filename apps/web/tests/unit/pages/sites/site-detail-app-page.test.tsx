import { render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  useRequest: vi.fn(),
  getPublicSitePackage: vi.fn(),
}))

vi.mock("alova/client", () => ({ useRequest: mocks.useRequest }))
vi.mock("~/lib/api", () => ({
  API_ORIGIN: "https://api.example.test",
  PUBLIC_SITE_ORIGIN: "https://public.example.test",
  getPublicSitePackage: mocks.getPublicSitePackage,
}))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))

import SiteDetailPage from "~/pages/sites/site-detail-page"

const longText =
  "https://example.test/this/is/a/continuous/path/that/must/not/overflow/a/narrow/app/viewport"

function renderPage() {
  mocks.useRequest.mockReturnValue({
    data: {
      slug: "long-site",
      title: `没有分隔符的超长站点标题${longText}`,
      description: longText,
      revisionId: "e1da2081-332d-4bf3-9c75-c34ed565379e",
      revisionNumber: 7,
      runtimeMode: "isolated-script",
      publishedAt: 1_787_360_809_934,
      siteUrl: "https://api.example.test/sites/long-site",
      contentUrl:
        "https://api.example.test/site-content/long-site/" +
        "e1da2081-332d-4bf3-9c75-c34ed565379e/",
    },
    loading: false,
    error: null,
  })

  const props = {
    params: { siteSlug: "long-site" },
  } as ComponentProps<typeof SiteDetailPage>

  return render(
    <MemoryRouter>
      <SiteDetailPage {...props} />
    </MemoryRouter>
  )
}

describe("SiteDetailPage App target", () => {
  it("keeps long content contained and opens the public site in the system browser", () => {
    renderPage()

    const main = screen.getByRole("main")
    const heading = screen.getByRole("heading", { level: 1 })
    const description = screen.getByText(longText)

    expect(main).toHaveClass("max-w-3xl", "px-(--app-safe-inline)", "py-5")
    expect(heading).toHaveClass("text-2xl", "wrap-anywhere")
    expect(description).toHaveClass("wrap-anywhere")
    expect(screen.queryByRole("link", { name: /返回作品中心/ })).toBeNull()
    expect(screen.getByRole("link", { name: /打开站点/ })).toHaveAttribute(
      "href",
      "https://public.example.test/sites/long-site"
    )
  })
})
