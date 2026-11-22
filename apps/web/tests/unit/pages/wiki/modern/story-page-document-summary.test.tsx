import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { installFetchMock } from "@/tests/unit/support/api-client"
import { renderPage } from "@/tests/unit/support/harness"
import {
  makeWikiPublicIdol,
  makeWikiPublicStories,
  makeWikiPublicStoryCard,
  makeWikiPublicStoryLink,
} from "@/mocks/data/wiki"
import type { WikiPublicStoryDocument } from "~/lib/api"
import { StoryPage } from "~/pages/wiki/modern/story-page"

const ROUTE = "/story?agency=闪耀色彩&idol=樱木真乃"

function card(id: number, title: string, url: string) {
  return {
    type: "card" as const,
    id,
    title,
    subtitle: "",
    fit: "cover" as const,
    asset: null,
    imageUrl: null,
    presentationPolicy: "inherit" as const,
    tags: [],
    links: [
      {
        up: "UP主",
        title,
        url,
        contentType: "剧情",
        sourcePlatform: "Bilibili",
      },
    ],
  }
}

const DOCUMENT: WikiPublicStoryDocument = {
  version: 1,
  headings: [
    { id: "shoulu", level: 2, text: "收录范围" },
    { id: "xize", level: 3, text: "细则" },
  ],
  availableTags: [],
  blocks: [
    {
      type: "cardGrid",
      layout: "grid",
      cols: null,
      ratio: null,
      filter: null,
      collapsed: false,
      title: "主线",
      cards: [
        card(1, "第一话", "https://www.bilibili.com/video/BV1"),
        card(2, "第二话", "https://www.bilibili.com/video/BV2"),
      ],
    },
    {
      type: "links",
      title: "资料来源",
      collapsed: false,
      links: [
        {
          up: "bwiki",
          title: "词条",
          url: "https://wiki.biligame.com/imascg/x",
          contentType: "Wiki",
          sourcePlatform: "bilibili wiki",
        },
      ],
    },
  ],
}

describe("StoryPage document summary", () => {
  it("counts sections, cards and sources from the compiled document", async () => {
    installFetchMock().mockResolvedValue(
      Response.json(
        makeWikiPublicStories({
          contentMode: "document",
          document: DOCUMENT,
          categories: [],
        })
      )
    )

    renderPage(<StoryPage />, { route: ROUTE })

    const header = await screen.findByTestId("story-profile-grid")
    expect(within(header).getByText("2 个章节")).toBeInTheDocument()
    expect(within(header).getByText("2 张卡片")).toBeInTheDocument()
    expect(within(header).getByText("3 个内容来源")).toBeInTheDocument()
    // The structured counters must not leak into a document page.
    expect(within(header).queryByText("0 个分类")).toBeNull()
  })

  it("includes embedded structured categories in document counts", async () => {
    const hybrid: WikiPublicStoryDocument = {
      ...DOCUMENT,
      blocks: [
        ...DOCUMENT.blocks,
        { type: "storyCategory", categoryName: "SSR", collapsed: false },
      ],
    }
    installFetchMock().mockResolvedValue(
      Response.json(
        makeWikiPublicStories({
          contentMode: "document",
          document: hybrid,
          categories: [
            {
              name: "SSR",
              cards: [
                makeWikiPublicStoryCard({
                  id: 901,
                  name: "【SSR】",
                  links: [
                    makeWikiPublicStoryLink({ id: 91 }),
                    makeWikiPublicStoryLink({ id: 92 }),
                  ],
                }),
              ],
            },
          ],
        })
      )
    )

    renderPage(<StoryPage />, { route: ROUTE })

    const header = await screen.findByTestId("story-profile-grid")
    expect(within(header).getByText("3 个章节")).toBeInTheDocument()
    expect(within(header).getByText("3 张卡片")).toBeInTheDocument()
    expect(within(header).getByText("5 个内容来源")).toBeInTheDocument()
  })

  it("hides the legacy Gakumas S-card cast filter when s_card uses document mode", async () => {
    const sCardDoc: WikiPublicStoryDocument = {
      version: 1,
      headings: [{ id: "图鉴", level: 2, text: "图鉴" }],
      availableTags: ["千奈", "广"],
      blocks: [
        {
          type: "heading",
          level: 2,
          id: "图鉴",
          children: [{ type: "text", value: "图鉴" }],
        },
        {
          type: "cardGrid",
          layout: "grid",
          cols: 4,
          ratio: "16/9",
          filter: "tags",
          collapsed: false,
          title: "S卡",
          cards: [
            {
              ...card(101, "【示例】", "https://www.bilibili.com/video/BV1"),
              tags: ["千奈", "广"],
            },
          ],
        },
      ],
    }
    installFetchMock().mockResolvedValue(
      Response.json(
        makeWikiPublicStories({
          agency: { id: 7, code: "gk", name: "学园偶像大师", color: "#f39800" },
          idol: makeWikiPublicIdol({
            id: 42,
            name: "S卡",
            folderName: "s_card",
            entryKind: "story",
            entrySubtype: "special",
          }),
          contentMode: "document",
          document: sCardDoc,
          categories: [],
        })
      )
    )

    renderPage(<StoryPage />, {
      route: "/story?agency=学园偶像大师&idol=S卡",
    })

    const document = await screen.findByTestId("wiki-document")
    expect(
      within(document).getByRole("group", { name: "按标签筛选" })
    ).toBeVisible()
    expect(
      screen.queryByRole("region", { name: "按登场人物筛选" })
    ).not.toBeInTheDocument()
  })
})
