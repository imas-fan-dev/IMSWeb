import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { HomepageLink } from "~/lib/api"
import { AppsPage } from "~/pages/apps/index"

const homepageLinksHook = vi.hoisted(() => vi.fn())

vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))

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

function directoryLink(id: string, href: string, title = id): HomepageLink {
  return {
    id,
    section: "navigation",
    title,
    description: `${title}说明`,
    href,
    icon: href.startsWith("http") ? "external-link" : "book-open",
    accent: "info",
    displayOrder: 0,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/apps"]}>
      <AppsPage />
    </MemoryRouter>
  )
}

function mockDirectoryState({
  navigation = [],
  loading = false,
  error,
  retry,
}: {
  navigation?: HomepageLink[]
  loading?: boolean
  error?: unknown
  retry: () => Promise<typeof emptyLinks>
}) {
  homepageLinksHook.mockReturnValue({
    data: {
      sections: {
        ...emptyLinks.sections,
        navigation,
      },
    },
    loading,
    error,
    retry,
  })
}

describe("AppsPage", () => {
  const retry = vi.fn(() => Promise.resolve(emptyLinks))

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("keeps core shortcuts visible while dynamic links load", () => {
    mockDirectoryState({ loading: true, retry })

    renderPage()

    const coreLinks = within(
      screen.getByRole("region", { name: "核心资料" })
    ).getAllByRole("link")
    expect(coreLinks).toHaveLength(1)
    expect(coreLinks[0]).toHaveAttribute("href", "/wiki")
    expect(coreLinks[0]).toHaveAccessibleName(/剧情站/)
    expect(screen.getByRole("status", { name: "正在加载应用" })).toBeVisible()
  })

  it("keeps core shortcuts visible when the shared request fails and retries it", async () => {
    mockDirectoryState({ error: new Error("offline"), retry })
    const user = userEvent.setup()

    renderPage()

    expect(
      within(screen.getByRole("region", { name: "核心资料" })).getByRole(
        "link",
        { name: /剧情站/ }
      )
    ).toBeVisible()
    expect(screen.getByText("更多入口暂时无法加载")).toBeVisible()
    expect(screen.getByText(/核心资料仍可使用/)).toBeVisible()
    await user.click(screen.getByRole("button", { name: "重试" }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it("shows the dynamic empty state without hiding core shortcuts", () => {
    mockDirectoryState({ retry })

    renderPage()

    expect(screen.getByText("当前没有更多入口")).toBeVisible()
    expect(screen.getAllByRole("link")).toHaveLength(1)
  })

  it("groups resources by resolved destination and preserves extensions", () => {
    mockDirectoryState({
      retry,
      navigation: [
        directoryLink("events", "/events", "活动中心"),
        directoryLink("cards", "/community/cards", "名片墙旧入口"),
        directoryLink("account", "/account/me", "帐号旧入口"),
        directoryLink("works", "/works", "作品资料"),
        directoryLink(
          "card-submission",
          "/community/cards/submissions/42",
          "名片投稿详情"
        ),
        directoryLink(
          "account-deep-link",
          "/account/me/profile/security",
          "帐号深层入口"
        ),
        directoryLink("relative-tool", "tools/local", "相对工具入口"),
        directoryLink(
          "external",
          "https://example.com/resources",
          "外部资料站"
        ),
        directoryLink("blocked", "javascript:alert(1)", "不可用入口"),
      ],
    })

    renderPage()

    const moreSection = screen
      .getByRole("heading", { name: "更多入口" })
      .closest("section") as HTMLElement
    const more = within(moreSection)

    expect(more.getByRole("link", { name: /作品资料/ })).toHaveAttribute(
      "href",
      "/works"
    )
    expect(more.getByRole("heading", { name: "扩展入口" })).toBeVisible()
    expect(more.getByRole("link", { name: /名片投稿详情/ })).toHaveAttribute(
      "href",
      "/community/cards/submissions/42"
    )
    expect(more.getByRole("link", { name: /帐号深层入口/ })).toHaveAttribute(
      "href",
      "/account/me/profile/security"
    )
    expect(more.getByRole("link", { name: /相对工具入口/ })).toBeVisible()

    const external = more.getByRole("link", { name: /外部资料站/ })
    expect(external).toHaveAttribute("target", "_blank")
    expect(external).toHaveAttribute("rel", "noreferrer")

    expect(more.queryByText("活动中心")).not.toBeInTheDocument()
    expect(more.queryByText("名片墙旧入口")).not.toBeInTheDocument()
    expect(more.queryByText("帐号旧入口")).not.toBeInTheDocument()
    expect(more.queryByText("不可用入口")).not.toBeInTheDocument()
  })

  it("dedupes only identical canonical destinations", () => {
    mockDirectoryState({
      retry,
      navigation: [
        directoryLink("wiki-copy", "/wiki/", "Wiki 重复入口"),
        directoryLink("wiki-preset", "/wiki?agency=765", "Wiki 企划预设"),
        directoryLink("story-anchor", "/story#modern", "剧情锚点"),
        directoryLink("public-wiki", "https://example.com/wiki", "站外 Wiki"),
        directoryLink(
          "public-wiki-copy",
          "https://example.com/wiki",
          "站外 Wiki 重复入口"
        ),
      ],
    })

    renderPage()

    expect(screen.queryByText("Wiki 重复入口")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Wiki 企划预设/ })).toHaveAttribute(
      "href",
      "/wiki?agency=765"
    )
    expect(screen.getByRole("link", { name: /剧情锚点/ })).toHaveAttribute(
      "href",
      "/story#modern"
    )
    const publicWikiLink = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("href") === "https://example.com/wiki")
    expect(publicWikiLink).toHaveTextContent("站外 Wiki")
    expect(screen.queryByText("站外 Wiki 重复入口")).not.toBeInTheDocument()
  })
})
