import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { installFetchMock } from "@/tests/unit/support/api-client"
import { renderPage } from "@/tests/unit/support/harness"
import { makeWikiPublicStories } from "@/mocks/data/wiki"
import type { WikiPublicStoryDocument } from "~/lib/api"
import { StoryPage } from "~/pages/wiki/modern/story-page"

const ROUTE = "/story?agency=闪耀色彩&idol=樱木真乃"

function documentPayload(document: WikiPublicStoryDocument) {
  return makeWikiPublicStories({
    contentMode: "document",
    document,
    categories: [],
  })
}

function renderDocument(document: WikiPublicStoryDocument) {
  installFetchMock().mockResolvedValue(Response.json(documentPayload(document)))
  return renderPage(<StoryPage />, { route: ROUTE })
}

const TABS_DOCUMENT: WikiPublicStoryDocument = {
  version: 1,
  headings: [],
  availableTags: [],
  blocks: [
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
  ],
}

describe("StoryPage document story blocks", () => {
  it("renders tabs as a tablist and switches the visible panel", async () => {
    const user = userEvent.setup()
    renderDocument(TABS_DOCUMENT)

    const document = await screen.findByTestId("wiki-document")
    const firstTab = await within(document).findByRole("tab", {
      name: "CG 版",
    })
    const secondTab = within(document).getByRole("tab", { name: "新剧场版" })
    expect(firstTab).toHaveAttribute("aria-selected", "true")
    expect(secondTab).toHaveAttribute("aria-selected", "false")
    expect(within(document).getByText("2005 年初版")).toBeVisible()
    expect(within(document).queryByText("2011 年重制")).not.toBeInTheDocument()

    await user.click(secondTab)

    expect(secondTab).toHaveAttribute("aria-selected", "true")
    expect(firstTab).toHaveAttribute("aria-selected", "false")
    expect(within(document).getByText("2011 年重制")).toBeVisible()
    expect(within(document).queryByText("2005 年初版")).not.toBeInTheDocument()
  })

  it("renders a collapsible source link group with compact link items", async () => {
    const user = userEvent.setup()
    renderDocument({
      version: 1,
      headings: [],
      availableTags: [],
      blocks: [
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
            {
              up: "词条组",
              title: "卡面词条",
              url: "https://wiki.biligame.com/imass/X",
              contentType: "Wiki",
              sourcePlatform: "bilibili wiki",
            },
          ],
        },
      ],
    })

    const document = await screen.findByTestId("wiki-document")
    const group = within(document)
      .getByText("主要来源")
      .closest("details") as HTMLElement
    expect(group).not.toHaveAttribute("open")
    const firstLink = within(group).getByRole("link", {
      name: /第一话【中字】/,
    })
    expect(firstLink).not.toBeVisible()
    expect(within(group).getByText("2 条来源")).toBeVisible()

    await user.click(within(group).getByText("主要来源"))

    expect(group).toHaveAttribute("open")
    expect(firstLink).toBeVisible()
    expect(firstLink).toHaveAttribute(
      "href",
      "https://www.bilibili.com/video/BV1"
    )
    expect(firstLink).toHaveAttribute("target", "_blank")
    expect(within(group).getByText("来源：UP主甲")).toBeVisible()
    expect(
      within(group).getByRole("link", { name: /卡面词条/ })
    ).toHaveAttribute("href", "https://wiki.biligame.com/imass/X")
    expect(within(group).getByText("Wiki")).toBeVisible()
    expect(within(group).getByText("bilibili wiki")).toBeVisible()
  })

  it("renders cards as legacy-style card buttons that open the source dialog", async () => {
    const user = userEvent.setup()
    renderDocument({
      version: 1,
      headings: [],
      availableTags: ["天海春香"],
      blocks: [
        {
          type: "cardGrid",
          layout: "grid",
          cols: 3,
          ratio: "16/9",
          filter: null,
          collapsed: false,
          title: "S 卡图鉴",
          cards: [
            {
              type: "card",
              id: 41,
              title: "【初星】",
              subtitle: "序章",
              fit: "contain",
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
              id: 42,
              title: "【语音】",
              subtitle: "",
              fit: "cover",
              tags: [],
              links: [
                {
                  up: "UP主乙",
                  title: "语音合集",
                  url: "https://www.bilibili.com/video/BV3",
                  contentType: "语音",
                  sourcePlatform: "Bilibili",
                },
              ],
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
    })

    const document = await screen.findByTestId("wiki-document")
    expect(within(document).getByText("S 卡图鉴")).toBeVisible()
    const storyCard = within(document).getByRole("button", {
      name: /【初星】/,
    })
    expect(storyCard).toHaveAttribute("id", "story-card-41")
    expect(storyCard).toHaveAttribute("data-story-state", "available")
    expect(within(storyCard).getByText("序章")).toBeVisible()
    expect(within(storyCard).getByText("天海春香")).toBeVisible()

    const voiceCard = within(document).getByRole("button", {
      name: /【语音】/,
    })
    expect(voiceCard).toHaveAttribute("data-story-state", "unavailable")
    expect(voiceCard).toHaveClass("opacity-60", "grayscale")
    expect(voiceCard).toHaveAttribute("aria-label", "【语音】，暂无剧情来源")

    const textOnlyCard = within(document).getByRole("button", {
      name: "初，暂无剧情来源",
    })
    expect(textOnlyCard).not.toHaveAttribute("id")
    expect(textOnlyCard).toHaveAttribute("data-story-state", "unavailable")

    await user.click(storyCard)

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByRole("heading", { name: "【初星】" })
    ).toBeVisible()
    expect(within(dialog).getByText("S 卡图鉴")).toBeVisible()
    expect(within(dialog).getByText("序章")).toBeVisible()
    expect(
      within(dialog).getByRole("link", { name: /初星 剧情/ })
    ).toHaveAttribute("href", "https://www.bilibili.com/video/BV2")
    expect(within(dialog).getByText("来源：UP主甲")).toBeVisible()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    await user.click(textOnlyCard)

    const emptyDialog = await screen.findByRole("dialog")
    expect(within(emptyDialog).getByText("暂无可用剧情来源")).toBeVisible()
    expect(
      within(emptyDialog).getByRole("heading", { name: "初" })
    ).toBeVisible()
  })

  it("focuses, scrolls to, and highlights a deep-linked document card", async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    })
    installFetchMock().mockResolvedValue(
      Response.json(
        documentPayload({
          version: 1,
          headings: [],
          availableTags: [],
          blocks: [
            {
              type: "cardGrid",
              layout: "grid",
              cols: null,
              ratio: null,
              filter: null,
              collapsed: false,
              title: "深链卡池",
              cards: [
                {
                  type: "card",
                  id: 41,
                  title: "【初星】",
                  subtitle: "",
                  fit: "cover",
                  tags: [],
                  links: [],
                },
              ],
            },
          ],
        })
      )
    )
    renderPage(<StoryPage />, { route: `${ROUTE}#story-card-41` })

    const card = await screen.findByRole("button", {
      name: "【初星】，暂无剧情来源",
    })
    await waitFor(() => expect(card).toHaveFocus())
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      inline: "nearest",
      behavior: "auto",
    })
    expect(card).toHaveAttribute("data-cover-target", "true")
    expect(card).toHaveClass("ring-3", "ring-primary", "ring-offset-3")
  })

  it("filters tag-enabled card grids with the generic tag facet bar", async () => {
    const user = userEvent.setup()
    renderDocument({
      version: 1,
      headings: [],
      availableTags: ["天海春香", "765PRO"],
      blocks: [
        {
          type: "cardGrid",
          layout: "grid",
          cols: null,
          ratio: null,
          filter: "tags",
          collapsed: false,
          title: "可筛选卡池",
          cards: [
            {
              type: "card",
              id: null,
              title: "卡甲",
              subtitle: "",
              fit: "cover",
              tags: ["天海春香"],
              links: [],
            },
            {
              type: "card",
              id: null,
              title: "卡乙",
              subtitle: "",
              fit: "cover",
              tags: ["765PRO"],
              links: [],
            },
          ],
        },
        {
          type: "cardGrid",
          layout: "grid",
          cols: null,
          ratio: null,
          filter: null,
          collapsed: false,
          title: "固定卡池",
          cards: [
            {
              type: "card",
              id: null,
              title: "卡丙",
              subtitle: "",
              fit: "cover",
              tags: ["天海春香"],
              links: [],
            },
          ],
        },
      ],
    })

    const document = await screen.findByTestId("wiki-document")
    const tagBar = within(document).getByRole("group", { name: "按标签筛选" })
    const manTag = within(tagBar).getByRole("button", {
      name: "天海春香",
      pressed: false,
    })
    expect(within(tagBar).getByRole("button", { name: "765PRO" })).toBeVisible()
    expect(within(document).getByRole("button", { name: /卡甲/ })).toBeVisible()

    await user.click(manTag)

    expect(manTag).toHaveAttribute("aria-pressed", "true")
    expect(within(document).getByRole("button", { name: /卡甲/ })).toBeVisible()
    expect(
      within(document).queryByRole("button", { name: /卡乙/ })
    ).not.toBeInTheDocument()
    // Grids without `filter="tags"` keep every card.
    expect(within(document).getByRole("button", { name: /卡丙/ })).toBeVisible()

    // Facets combine with OR: adding a second tag widens the visible set.
    await user.click(within(tagBar).getByRole("button", { name: "765PRO" }))
    expect(within(document).getByRole("button", { name: /卡甲/ })).toBeVisible()
    expect(within(document).getByRole("button", { name: /卡乙/ })).toBeVisible()

    await user.click(within(tagBar).getByRole("button", { name: "天海春香" }))
    expect(
      within(document).queryByRole("button", { name: /卡甲/ })
    ).not.toBeInTheDocument()
    expect(within(document).getByRole("button", { name: /卡乙/ })).toBeVisible()

    await user.click(within(document).getByRole("button", { name: "清除筛选" }))

    expect(
      within(tagBar).getByRole("button", { name: "天海春香" })
    ).toHaveAttribute("aria-pressed", "false")
    expect(within(document).getByRole("button", { name: /卡甲/ })).toBeVisible()
    expect(within(document).getByRole("button", { name: /卡乙/ })).toBeVisible()
  })

  it("filters cards, source links, and sections with the page keyword search", async () => {
    const user = userEvent.setup()
    renderDocument({
      version: 1,
      headings: [
        { id: "序章", level: 2, text: "序章" },
        { id: "尾声", level: 2, text: "尾声" },
      ],
      availableTags: [],
      blocks: [
        {
          type: "heading",
          level: 2,
          id: "序章",
          children: [{ type: "text", value: "序章" }],
        },
        {
          type: "cardGrid",
          layout: "grid",
          cols: null,
          ratio: null,
          filter: null,
          collapsed: false,
          title: "卡池",
          cards: [
            {
              type: "card",
              id: null,
              title: "初星",
              subtitle: "",
              fit: "cover",
              tags: [],
              links: [],
            },
            {
              type: "card",
              id: null,
              title: "花风Smiley",
              subtitle: "",
              fit: "cover",
              tags: [],
              links: [],
            },
          ],
        },
        {
          type: "heading",
          level: 2,
          id: "尾声",
          children: [{ type: "text", value: "尾声" }],
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "完结" }],
        },
        {
          type: "links",
          title: "尾声来源",
          collapsed: false,
          links: [
            {
              up: "UP主甲",
              title: "尾声 熟肉",
              url: "https://www.bilibili.com/video/BV8",
              contentType: "剧情",
              sourcePlatform: "Bilibili",
            },
            {
              up: "UP主乙",
              title: "序章 生肉",
              url: "https://www.bilibili.com/video/BV9",
              contentType: "剧情",
              sourcePlatform: "Bilibili",
            },
          ],
        },
      ],
    })

    const document = await screen.findByTestId("wiki-document")
    await screen.findByRole("heading", { name: "序章" })

    await user.type(screen.getByTestId("story-primary-search"), "初星")

    await waitFor(() =>
      expect(
        within(document).queryByRole("button", { name: /花风Smiley/ })
      ).not.toBeInTheDocument()
    )
    expect(within(document).getByRole("button", { name: /初星/ })).toBeVisible()
    // The section heading survives because its content still matches.
    expect(
      within(document).getByRole("heading", { name: "序章" })
    ).toBeVisible()
    expect(
      within(document).queryByRole("heading", { name: "尾声" })
    ).not.toBeInTheDocument()
    expect(within(document).queryByText("完结")).not.toBeInTheDocument()

    await user.clear(screen.getByTestId("story-primary-search"))
    await user.type(screen.getByTestId("story-primary-search"), "生肉")

    await waitFor(() =>
      expect(
        within(document).queryByRole("button", { name: /初星/ })
      ).not.toBeInTheDocument()
    )
    const sourceLink = within(document).getByRole("link", { name: /序章 生肉/ })
    expect(sourceLink).toBeVisible()
    expect(
      within(document).queryByRole("link", { name: /尾声 熟肉/ })
    ).not.toBeInTheDocument()
    expect(
      within(document).getByRole("heading", { name: "尾声" })
    ).toBeVisible()
  })

  it("exposes the parsed card fit and grid ratio on the card grid items", async () => {
    renderDocument({
      version: 1,
      headings: [],
      availableTags: [],
      blocks: [
        {
          type: "cardGrid",
          layout: "banner",
          cols: null,
          ratio: "2.8/1",
          filter: null,
          collapsed: false,
          title: "横幅卡池",
          cards: [
            {
              type: "card",
              id: null,
              title: "横幅甲",
              subtitle: "",
              fit: "contain",
              tags: [],
              links: [],
            },
            {
              type: "card",
              id: null,
              title: "横幅乙",
              subtitle: "",
              fit: "cover",
              tags: [],
              links: [],
            },
          ],
        },
      ],
    })

    const document = await screen.findByTestId("wiki-document")
    const grid = document.querySelector('[data-card-layout="banner"]')
    expect(grid).toHaveAttribute("data-card-ratio", "2.8/1")
    expect(
      within(document).getByRole("button", { name: "横幅甲，暂无剧情来源" })
    ).toHaveAttribute("data-card-fit", "contain")
    expect(
      within(document).getByRole("button", { name: "横幅乙，暂无剧情来源" })
    ).toHaveAttribute("data-card-fit", "cover")
  })

  it("searches and tag-filters cards nested in container blocks", async () => {
    const user = userEvent.setup()
    renderDocument({
      version: 1,
      headings: [],
      availableTags: ["天海春香", "765PRO"],
      blocks: [
        {
          type: "callout",
          tone: "info",
          title: "嵌套卡池说明",
          children: [
            {
              type: "cardGrid",
              layout: "grid",
              cols: null,
              ratio: null,
              filter: "tags",
              collapsed: false,
              title: "嵌套卡池",
              cards: [
                {
                  type: "card",
                  id: null,
                  title: "嵌套甲",
                  subtitle: "",
                  fit: "cover",
                  tags: ["天海春香"],
                  links: [],
                },
                {
                  type: "card",
                  id: null,
                  title: "嵌套乙",
                  subtitle: "",
                  fit: "cover",
                  tags: ["765PRO"],
                  links: [],
                },
              ],
            },
          ],
        },
      ],
    })

    const document = await screen.findByTestId("wiki-document")
    await screen.findByRole("note")
    const tagBar = within(document).getByRole("group", { name: "按标签筛选" })
    await user.click(within(tagBar).getByRole("button", { name: "天海春香" }))

    const filteredCallout = within(document).getByRole("note")
    expect(
      within(filteredCallout).getByRole("button", { name: /嵌套甲/ })
    ).toBeVisible()
    expect(
      within(filteredCallout).queryByRole("button", { name: /嵌套乙/ })
    ).not.toBeInTheDocument()

    await user.click(within(document).getByRole("button", { name: "清除筛选" }))
    await user.type(screen.getByTestId("story-primary-search"), "嵌套乙")

    await waitFor(() =>
      expect(
        within(within(document).getByRole("note")).queryByRole("button", {
          name: /嵌套甲/,
        })
      ).not.toBeInTheDocument()
    )
    expect(
      within(within(document).getByRole("note")).getByRole("button", {
        name: /嵌套乙/,
      })
    ).toBeVisible()
  })

  it("renders collapsed link groups and card grids as closed details", async () => {
    const user = userEvent.setup()
    renderDocument({
      version: 1,
      headings: [],
      availableTags: [],
      blocks: [
        {
          type: "links",
          title: "折叠来源",
          collapsed: true,
          links: [
            {
              up: "UP主甲",
              title: "折叠链接",
              url: "https://www.bilibili.com/video/BV7",
              contentType: "剧情",
              sourcePlatform: "Bilibili",
            },
          ],
        },
        {
          type: "cardGrid",
          layout: "grid",
          cols: null,
          ratio: null,
          filter: null,
          collapsed: true,
          title: "折叠卡池",
          cards: [
            {
              type: "card",
              id: null,
              title: "折叠卡",
              subtitle: "",
              fit: "cover",
              tags: [],
              links: [],
            },
          ],
        },
      ],
    })

    const document = await screen.findByTestId("wiki-document")
    const linksDetails = within(document)
      .getByText("折叠来源")
      .closest("details") as HTMLElement
    expect(linksDetails).not.toHaveAttribute("open")
    const gridDetails = within(document)
      .getByText("折叠卡池")
      .closest("details") as HTMLElement
    expect(gridDetails).not.toHaveAttribute("open")
    const card = within(gridDetails).getByRole("button", {
      name: "折叠卡，暂无剧情来源",
    })
    expect(card).not.toBeVisible()

    await user.click(within(gridDetails).getByText("折叠卡池"))

    expect(gridDetails).toHaveAttribute("open")
    expect(card).toBeVisible()
  })
})
