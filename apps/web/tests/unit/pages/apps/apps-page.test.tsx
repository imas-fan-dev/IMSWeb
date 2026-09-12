import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppsPage } from "~/pages/apps/index"

const homepageLinksHook = vi.hoisted(() => vi.fn())

vi.mock("~/pages/home/hooks/use-homepage-links", () => ({
  HomepageLinksProvider: ({ children }: { children: ReactNode }) => children,
  useHomepageLinks: homepageLinksHook,
}))

const emptyLinks = {
  sections: {
    navigation: [],
    friend: [],
    support: [],
  },
}

const navigationLinks = [
  {
    id: "events",
    section: "navigation",
    title: "活动中心",
    description: "查看近期活动",
    href: "/events",
    icon: "calendar",
    accent: "franchise-765",
    displayOrder: 0,
  },
  {
    id: "external",
    section: "navigation",
    title: "外部资料站",
    description: "在系统浏览器中打开",
    href: "https://example.com/resources",
    icon: "external-link",
    accent: "info",
    displayOrder: 1,
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <AppsPage />
    </MemoryRouter>
  )
}

describe("AppsPage", () => {
  const retry = vi.fn(() => Promise.resolve(emptyLinks))

  beforeEach(() => {
    retry.mockClear()
  })

  it("shows the loading state", () => {
    homepageLinksHook.mockReturnValue({
      data: emptyLinks,
      loading: true,
      error: undefined,
      retry,
    })

    renderPage()

    expect(screen.getByRole("status", { name: "正在加载应用" })).toBeVisible()
  })

  it("shows an error and retries the shared request", async () => {
    homepageLinksHook.mockReturnValue({
      data: emptyLinks,
      loading: false,
      error: new Error("offline"),
      retry,
    })
    const user = userEvent.setup()

    renderPage()

    expect(screen.getByText("应用列表暂时无法加载")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "重试" }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it("shows the empty state", () => {
    homepageLinksHook.mockReturnValue({
      data: emptyLinks,
      loading: false,
      error: undefined,
      retry,
    })

    renderPage()

    expect(screen.getByText("当前没有可用应用")).toBeVisible()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("keeps API order and renders internal and external navigation", () => {
    homepageLinksHook.mockReturnValue({
      data: {
        sections: {
          ...emptyLinks.sections,
          navigation: navigationLinks,
        },
      },
      loading: false,
      error: undefined,
      retry,
    })

    renderPage()

    const grid = screen.getByTestId("portal-directory-grid")
    expect(grid).toHaveClass("grid-cols-2")
    expect(
      within(grid)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
    ).toEqual(["/events", "https://example.com/resources"])

    const internalLink = screen.getByRole("link", { name: /活动中心/ })
    expect(internalLink).not.toHaveAttribute("target")

    const externalLink = screen.getByRole("link", { name: /外部资料站/ })
    expect(externalLink).toHaveAttribute("target", "_blank")
    expect(externalLink).toHaveAttribute("rel", "noreferrer")
    expect(
      within(externalLink).getByTestId("external-link-icon")
    ).toBeInTheDocument()
  })
})
