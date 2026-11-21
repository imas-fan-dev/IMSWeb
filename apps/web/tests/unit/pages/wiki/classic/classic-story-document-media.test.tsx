import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { installFetchMock } from "@/tests/unit/support/api-client"
import { renderPage } from "@/tests/unit/support/harness"
import {
  makeWikiPublicStories,
  makeWikiPublicStoryCard,
} from "@/mocks/data/wiki"
import type { WikiPublicStories, WikiPublicStoryDocument } from "~/lib/api"
import { ClassicStoryPage } from "~/pages/wiki/classic/classic-story-page"

const ROUTE = "/story/classic?agency=闪耀色彩&idol=樱木真乃"

const HYBRID_DOCUMENT: WikiPublicStoryDocument = {
  version: 1,
  headings: [{ id: "导语", level: 2, text: "导语" }],
  availableTags: [],
  blocks: [
    {
      type: "heading",
      level: 2,
      id: "导语",
      children: [{ type: "text", value: "导语" }],
    },
    {
      type: "media",
      asset: { kind: "cover", id: 3 },
      caption: "共享封面",
      fit: "contain",
      imageUrl: "https://media.test/cover-3.webp",
      presentationPolicy: "contain",
    },
    {
      type: "storyCategory",
      categoryName: "SSR",
      collapsed: false,
    },
  ],
}

function hybridStories(): WikiPublicStories {
  return makeWikiPublicStories({
    contentMode: "document",
    document: HYBRID_DOCUMENT,
    categories: [
      {
        name: "SSR",
        cards: [makeWikiPublicStoryCard({ id: 901, name: "【SSR｜真乃】" })],
      },
    ],
  })
}

describe("ClassicStoryPage document media and embedded categories", () => {
  it("renders the shared cover figure and the embedded category inline", async () => {
    installFetchMock().mockResolvedValue(Response.json(hybridStories()))
    renderPage(<ClassicStoryPage />, { route: ROUTE })

    const content = await screen.findByText("共享封面")
    const figure = content.closest("figure") as HTMLElement
    expect(figure).not.toBeNull()
    expect(
      within(figure).getByRole("img", { name: "共享封面" })
    ).toHaveAttribute("src", "https://media.test/cover-3.webp")

    const inline = document.querySelector(
      ".wiki-classic-story-document #story-category-SSR"
    ) as HTMLElement
    expect(inline).not.toBeNull()
    expect(
      within(inline).getByRole("button", { name: /SSR｜真乃/ })
    ).toBeInTheDocument()
    // The structured pool is not repeated below the document article.
    expect(document.querySelector(".wiki-classic-story-categories")).toBeNull()
    expect(document.querySelectorAll("#story-category-SSR").length).toBe(1)
  })
})
