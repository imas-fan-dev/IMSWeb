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
  getPublicSitePackage: mocks.getPublicSitePackage,
}))

import SiteDetailPage from "~/pages/sites/site-detail-page"

const site = {
  slug: "hiro2026",
  title: "Hiro 2026",
  description: "Independent package",
  revisionId: "e1da2081-332d-4bf3-9c75-c34ed565379e",
  revisionNumber: 1,
  runtimeMode: "isolated-script" as const,
  publishedAt: 1_787_360_809_934,
  siteUrl: "https://api.example.test/sites/hiro2026",
  contentUrl:
    "https://api.example.test/site-content/hiro2026/" +
    "e1da2081-332d-4bf3-9c75-c34ed565379e/",
}

function renderPage() {
  mocks.useRequest.mockReturnValue({
    data: site,
    loading: false,
    error: null,
  })
  const props = {
    params: { siteSlug: site.slug },
  } as ComponentProps<typeof SiteDetailPage>
  return render(
    <MemoryRouter>
      <SiteDetailPage {...props} />
    </MemoryRouter>
  )
}

describe("SiteDetailPage", () => {
  it("builds the public site destination from the package slug", () => {
    renderPage()

    expect(screen.getByRole("link", { name: /打开站点/ })).toHaveAttribute(
      "href",
      "/sites/hiro2026"
    )
  })

  it("uses unified internal navigation for the return link", () => {
    renderPage()

    expect(screen.getByRole("link", { name: /返回作品中心/ })).toHaveAttribute(
      "href",
      "/works"
    )
  })
})
