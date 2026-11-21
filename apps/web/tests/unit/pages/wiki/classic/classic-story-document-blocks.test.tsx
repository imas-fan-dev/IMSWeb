import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { installFetchMock } from "@/tests/unit/support/api-client"
import { renderPage } from "@/tests/unit/support/harness"
import { makeWikiPublicIdol, makeWikiPublicStories } from "@/mocks/data/wiki"
import type { WikiPublicStoryDocument } from "~/lib/api"
import { ClassicStoryPage } from "~/pages/wiki/classic/classic-story-page"

const ROUTE = "/story/classic?agency=闪耀色彩&idol=樱木真乃"

const DOCUMENT: WikiPublicStoryDocument = {
  version: 1,
  headings: [],
  availableTags: ["天海春香", "765PRO"],
  blocks: [
    {
      type: "paragraph",
      children: [{ type: "text", value: "经典视图同样渲染增强文档。" }],
    },
    {
      type: "tabs",
      items: [
        {
          type: "tab",
          title: "CG 版",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", value: "2005 年初版" }],
            },
          ],
        },
        {
          type: "tab",
          title: "新剧场版",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", value: "2011 年重制" }],
            },
          ],
        },
      ],
    },
    {
      type: "links",
      title: "主要来源",
      collapsed: true,
      links: [
        {
          up: "UP主甲",
          title: "第一话【中字】",
          url: "https://www.bilibili.com/video/BV1",
          contentType: "剧情",
          sourcePlatform: "Bilibili",
        },
      ],
    },
    {
      type: "cardGrid",
      layout: "grid",
      cols: 2,
      ratio: null,
      filter: "tags",
      collapsed: false,
      title: "S 卡图鉴",
      cards: [
        {
          type: "card",
          id: 41,
          title: "【初星】",
          subtitle: "",
          fit: "cover",
          tags: ["天海春香"],
          links: [
            {
              up: "UP主甲",
              title: "初星 剧情",
              url: "https://www.bilibili.com/video/BV2",
              contentType: "剧情",
              sourcePlatform: "Bilibili",
            },
          ],
        },
        {
          type: "card",
          id: null,
          title: "【学马仕】",
          subtitle: "",
          fit: "cover",
          tags: ["765PRO"],
          links: [],
        },
        {
          type: "card",
          id: null,
          title: "初",
          subtitle: "",
          fit: "cover",
          tags: [],
          links: [],
        },
      ],
    },
  ],
}

function documentPayload() {
  return makeWikiPublicStories({
    agency: { id: 6, code: "sc", name: "闪耀色彩", color: "#8dbbff" },
    idol: makeWikiPublicIdol({
      id: 6,
      name: "樱木真乃",
      folderName: "sakuragi_mano",
      color: "#f1b0c9",
      imageUrl: "/image/mano.webp",
    }),
    contentMode: "document",
    document: DOCUMENT,
    categories: [],
  })
}

function renderClassicDocument(route = ROUTE) {
  installFetchMock().mockResolvedValue(Response.json(documentPayload()))
  return renderPage(<ClassicStoryPage />, { route })
}

describe("ClassicStoryPage document story blocks", () => {
  it("renders tabs, collapsible links, cards, and the tag facet bar", async () => {
    const user = userEvent.setup()
    renderClassicDocument()

    const document = await screen.findByTestId("wiki-document")
    expect(
      within(document).getByText("经典视图同样渲染增强文档。")
    ).toBeVisible()

    const secondTab = within(document).getByRole("tab", { name: "新剧场版" })
    expect(within(document).getByText("2005 年初版")).toBeVisible()
    await user.click(secondTab)
    expect(within(document).getByText("2011 年重制")).toBeVisible()
    expect(within(document).queryByText("2005 年初版")).not.toBeInTheDocument()

    const linkGroup = within(document)
      .getByText("主要来源")
      .closest("details") as HTMLElement
    expect(linkGroup).not.toHaveAttribute("open")
    await user.click(within(linkGroup).getByText("主要来源"))
    expect(
      within(linkGroup).getByRole("link", { name: /第一话【中字】/ })
    ).toBeVisible()

    const storyCard = within(document).getByRole("button", {
      name: /【初星】/,
    })
    expect(storyCard).toHaveAttribute("data-story-state", "available")
    await user.click(storyCard)
    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByRole("heading", { name: "【初星】" })
    ).toBeVisible()
    expect(
      within(dialog).getByRole("link", { name: /初星 剧情/ })
    ).toHaveAttribute("href", "https://www.bilibili.com/video/BV2")
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    const tagBar = within(document).getByRole("group", { name: "按标签筛选" })
    await user.click(within(tagBar).getByRole("button", { name: "天海春香" }))
    expect(
      within(document).getByRole("button", { name: /【初星】/ })
    ).toBeVisible()
    expect(
      within(document).queryByRole("button", { name: /【学马仕】/ })
    ).not.toBeInTheDocument()
  })

  it("focuses and highlights a deep-linked document card", async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    })
    renderClassicDocument(`${ROUTE}#story-card-41`)

    const card = await screen.findByRole("button", { name: /【初星】/ })
    await waitFor(() => expect(card).toHaveFocus())
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      inline: "nearest",
      behavior: "auto",
    })
    expect(card).toHaveAttribute("data-cover-target", "true")
    expect(card).toHaveClass("ring-3", "ring-primary", "ring-offset-3")
  })

  it("dims cards without a 剧情 source and opens the zero-link and text-only cards", async () => {
    const user = userEvent.setup()
    renderClassicDocument()

    const document = await screen.findByTestId("wiki-document")
    const zeroLinkCard = within(document).getByRole("button", {
      name: "【学马仕】，暂无剧情来源",
    })
    expect(zeroLinkCard).toHaveAttribute("data-story-state", "unavailable")
    expect(zeroLinkCard).toHaveClass("opacity-60", "grayscale")

    const textOnlyCard = within(document).getByRole("button", {
      name: "初，暂无剧情来源",
    })
    expect(textOnlyCard).toHaveAttribute("data-story-state", "unavailable")
    expect(within(textOnlyCard).getByText("初")).toBeVisible()
    expect(within(textOnlyCard).queryByText("个来源")).not.toBeInTheDocument()

    await user.click(zeroLinkCard)

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByRole("heading", { name: "【学马仕】" })
    ).toBeVisible()
    expect(within(dialog).getByText("暂无可用剧情来源")).toBeVisible()
  })
})
