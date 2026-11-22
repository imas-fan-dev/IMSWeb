import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { installFetchMock } from "@/tests/unit/support/api-client"
import { renderPage } from "@/tests/unit/support/harness"
import { makeWikiPublicStories } from "@/mocks/data/wiki"
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
})
