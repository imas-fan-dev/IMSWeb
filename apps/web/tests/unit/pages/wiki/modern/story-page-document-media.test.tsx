import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { installFetchMock } from "@/tests/unit/support/api-client"
import { renderPage } from "@/tests/unit/support/harness"
import {
  makeWikiPublicStories,
  makeWikiPublicStoryCard,
} from "@/mocks/data/wiki"
import type { WikiPublicStories, WikiPublicStoryDocument } from "~/lib/api"
import { StoryPage } from "~/pages/wiki/modern/story-page"

const ROUTE = "/story?agency=闪耀色彩&idol=樱木真乃"

/** Hybrid document: an uploaded figure, a cover card, and an embedded category. */
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
      type: "paragraph",
      children: [{ type: "text", value: "先看主线。" }],
    },
    {
      type: "media",
      asset: { kind: "doc", id: 7 },
      caption: "剧情截图",
      fit: "contain",
      imageUrl: "/api/wiki/document-media/7.webp",
      presentationPolicy: "inherit",
    },
    {
      type: "cardGrid",
      layout: "portrait",
      cols: 3,
      ratio: "4/5",
      filter: null,
      collapsed: false,
      title: "",
      cards: [
        {
          type: "card",
          id: 41,
          title: "【初星】",
          subtitle: "序章",
          fit: "cover",
          asset: { kind: "cover", id: 3 },
          imageUrl: "https://media.test/cover-41.webp",
          presentationPolicy: "contain",
          tags: [],
          links: [],
        },
      ],
    },
    {
      type: "storyCategory",
      categoryName: "SSR",
      collapsed: false,
    },
    {
      type: "paragraph",
      children: [{ type: "text", value: "尾声。" }],
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
        cards: [
          makeWikiPublicStoryCard({ id: 900, name: "【SSR｜樱木真乃】" }),
        ],
      },
    ],
  })
}

function renderHybrid() {
  installFetchMock().mockResolvedValue(Response.json(hybridStories()))
  return renderPage(<StoryPage />, { route: ROUTE })
}

describe("StoryPage document media and embedded categories", () => {
  it("renders an uploaded figure with its caption and fit", async () => {
    renderHybrid()

    const document = await screen.findByTestId("wiki-document")
    const figure = within(document)
      .getByText("剧情截图")
      .closest("figure") as HTMLElement
    const image = within(figure).getByRole("img", { name: "剧情截图" })
    expect(image).toHaveAttribute("src", "/api/wiki/document-media/7.webp")
    expect(image).toHaveStyle({ objectFit: "contain" })
    expect(within(figure).getByText("剧情截图").tagName).toBe("FIGCAPTION")
  })

  it("renders card artwork and consumes the card fit and grid ratio", async () => {
    renderHybrid()

    const document = await screen.findByTestId("wiki-document")
    const grid = document.querySelector("[data-card-ratio]") as HTMLElement
    expect(grid).toHaveAttribute("data-card-ratio", "4/5")
    const card = within(grid).getByRole("button", { name: /【初星】/ })
    expect(card).toHaveAttribute("data-card-fit", "cover")
    const image = within(card).getByRole("presentation") as HTMLImageElement
    expect(image).toHaveAttribute("src", "https://media.test/cover-41.webp")
    // A `contain` presentation policy wins over the author's `cover` fit.
    expect(image).toHaveStyle({ objectFit: "contain" })
    expect(image.closest("[data-card-media]") as HTMLElement).toHaveStyle({
      aspectRatio: "4/5",
    })
  })

  it("mounts the embedded structured category at the directive position", async () => {
    renderHybrid()

    const document = await screen.findByTestId("wiki-document")
    const section = document.querySelector("#story-category-SSR") as HTMLElement
    expect(section).not.toBeNull()
    expect(within(section).getByText("SSR")).toBeInTheDocument()
    expect(
      within(section).getByRole("button", { name: /SSR｜樱木真乃/ })
    ).toBeInTheDocument()
    // The pool appears exactly once, inside the document, between the
    // paragraphs the author placed around the directive.
    expect(document.querySelectorAll("#story-category-SSR").length).toBe(1)
    const text = document.textContent ?? ""
    expect(text.indexOf("先看主线。")).toBeLessThan(text.indexOf("SSR"))
    expect(text.indexOf("SSR")).toBeLessThan(text.indexOf("尾声。"))
  })

  it("merges document headings and embedded categories into the TOC in order", async () => {
    renderHybrid()

    await screen.findByTestId("wiki-document")
    const sidebar = screen.getByTestId("story-navigation-sidebar")
    const links = within(sidebar)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"))
    expect(links).toContain("#导语")
    expect(links).toContain("#story-category-SSR")
    expect(links.indexOf("#导语")).toBeLessThan(
      links.indexOf("#story-category-SSR")
    )
  })

  it("filters the embedded category with the page keyword search", async () => {
    const user = userEvent.setup()
    renderHybrid()

    const document = await screen.findByTestId("wiki-document")
    const search = screen.getByTestId("story-primary-search")

    await user.type(search, "没有这个词")
    await waitFor(() =>
      expect(
        document.querySelector("#story-category-SSR")
      ).not.toBeInTheDocument()
    )
    expect(
      within(screen.getByTestId("story-navigation-sidebar")).queryByText("SSR")
    ).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, "SSR")
    await waitFor(() =>
      expect(document.querySelector("#story-category-SSR")).not.toBeNull()
    )
  })
})
