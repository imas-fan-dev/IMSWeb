import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { installFetchMock } from "@/tests/unit/support/api-client"
import { renderPage } from "@/tests/unit/support/harness"
import { makeWikiPublicStories } from "@/mocks/data/wiki"
import type { WikiPublicStoryDocument } from "~/lib/api"
import { StoryPage } from "~/pages/wiki/modern/story-page"

const ROUTE = "/story?agency=闪耀色彩&idol=樱木真乃"

const DOCUMENT: WikiPublicStoryDocument = {
  version: 1,
  headings: [
    { id: "观看顺序", level: 2, text: "观看顺序" },
    { id: "第一节", level: 3, text: "第一节" },
  ],
  availableTags: [],
  blocks: [
    {
      type: "heading",
      level: 2,
      id: "观看顺序",
      children: [{ type: "text", value: "观看顺序" }],
    },
    {
      type: "paragraph",
      children: [
        { type: "text", value: "先看 " },
        { type: "strong", children: [{ type: "text", value: "主线" }] },
        { type: "text", value: "，再看 " },
        {
          type: "link",
          url: "https://example.com/guide",
          children: [{ type: "text", value: "官方指引" }],
        },
        { type: "text", value: "。" },
      ],
    },
    {
      type: "paragraph",
      children: [
        {
          type: "link",
          url: "/wiki?agency=sc",
          children: [{ type: "text", value: "站内目录" }],
        },
      ],
    },
    {
      type: "callout",
      tone: "warning",
      title: "注意",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "不要提前剧透。" }],
        },
      ],
    },
    {
      type: "details",
      title: "剧透：结局",
      open: false,
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "结局是大团圆。" }],
        },
      ],
    },
    {
      type: "table",
      align: [null, "right"],
      header: [
        [{ type: "text", value: "章节" }],
        [{ type: "text", value: "数量" }],
      ],
      rows: [
        [[{ type: "text", value: "主线" }], [{ type: "text", value: "12" }]],
      ],
    },
  ],
}

function documentPayload() {
  return makeWikiPublicStories({
    contentMode: "document",
    document: DOCUMENT,
    categories: [],
  })
}

describe("StoryPage document mode", () => {
  it("renders the compiled document with callouts, collapsible details, and a heading TOC", async () => {
    installFetchMock().mockResolvedValue(Response.json(documentPayload()))
    const user = userEvent.setup()

    renderPage(<StoryPage />, { route: ROUTE })

    expect(
      await screen.findByRole("heading", { name: "观看顺序" })
    ).toBeVisible()
    const document = screen.getByTestId("wiki-document")
    expect(document).toBeVisible()
    expect(
      within(document).getByText("主线", { selector: "strong" })
    ).toBeVisible()
    expect(
      within(document).getByRole("link", { name: "官方指引" })
    ).toHaveAttribute("href", "https://example.com/guide")
    expect(
      within(document).getByRole("link", { name: "站内目录" })
    ).toHaveAttribute("href", "/wiki?agency=sc")
    const callout = within(document).getByRole("note")
    expect(callout).toHaveAttribute("data-callout", "warning")
    expect(within(callout).getByText("注意：注意")).toBeVisible()
    expect(within(callout).getByText("不要提前剧透。")).toBeVisible()

    const details = within(document).getByText("剧透：结局").closest("details")
    expect(details).not.toBeNull()
    expect(details).not.toHaveAttribute("open")
    expect(
      within(details as HTMLElement).getByText("结局是大团圆。")
    ).not.toBeVisible()
    await user.click(within(details as HTMLElement).getByText("剧透：结局"))
    expect(details).toHaveAttribute("open")

    expect(
      within(document).getByRole("columnheader", { name: "数量" })
    ).toHaveClass("text-right")
    expect(within(document).getByRole("cell", { name: "12" })).toBeVisible()

    const sidebar = screen.getByTestId("story-navigation-sidebar")
    expect(
      within(sidebar).getByRole("link", { name: "观看顺序" })
    ).toHaveAttribute("href", "#观看顺序")
    const nested = within(sidebar).getByRole("link", { name: "第一节" })
    expect(nested).toHaveAttribute("href", "#第一节")
    expect(nested).toHaveClass("pl-6")
    // A document page with no legacy cards still must not claim the page is empty.
    expect(screen.queryByText("当前没有已收录剧情")).not.toBeInTheDocument()
  })

  it("keeps structured entries on the legacy card layout without a document body", async () => {
    installFetchMock().mockResolvedValue(Response.json(makeWikiPublicStories()))
    renderPage(<StoryPage />, { route: ROUTE })

    expect(await screen.findByRole("heading", { name: "主线" })).toBeVisible()
    expect(screen.queryByTestId("wiki-document")).not.toBeInTheDocument()
  })
})
