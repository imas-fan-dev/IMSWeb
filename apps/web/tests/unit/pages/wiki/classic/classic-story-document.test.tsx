import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { installFetchMock } from "@/tests/unit/support/api-client"
import { renderPage } from "@/tests/unit/support/harness"
import { makeWikiPublicIdol, makeWikiPublicStories } from "@/mocks/data/wiki"
import type { WikiPublicStoryDocument } from "~/lib/api"
import { ClassicStoryPage } from "~/pages/wiki/classic/classic-story-page"

const ROUTE = "/story/classic?agency=闪耀色彩&idol=樱木真乃"

const DOCUMENT: WikiPublicStoryDocument = {
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
      children: [
        { type: "text", value: "这份档案整理了 " },
        { type: "emphasis", children: [{ type: "text", value: "全部" }] },
        { type: "text", value: " 公开来源。" },
      ],
    },
    {
      type: "callout",
      tone: "tip",
      title: "阅读顺序",
      children: [
        {
          type: "list",
          ordered: true,
          start: 1,
          items: [
            {
              children: [
                {
                  type: "paragraph",
                  children: [{ type: "text", value: "先看主线" }],
                },
              ],
            },
            {
              children: [
                {
                  type: "paragraph",
                  children: [{ type: "text", value: "再看活动" }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "details",
      title: "展开剧透",
      open: true,
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "结局已公开。" }],
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

describe("ClassicStoryPage document mode", () => {
  it("renders the shared document renderer inside the classic layout", async () => {
    installFetchMock().mockResolvedValue(Response.json(documentPayload()))
    const user = userEvent.setup()

    renderPage(<ClassicStoryPage />, { route: ROUTE })

    expect(
      await screen.findByRole("heading", { name: "樱木真乃" })
    ).toBeVisible()
    const document = screen.getByTestId("wiki-document")
    expect(document).toBeVisible()
    expect(
      within(document).getByRole("heading", { name: "导语" })
    ).toBeVisible()
    expect(within(document).getByText("全部", { selector: "em" })).toBeVisible()
    const callout = within(document).getByRole("note")
    expect(callout).toHaveAttribute("data-callout", "tip")
    expect(within(callout).getByText("提示：阅读顺序")).toBeVisible()
    expect(within(callout).getAllByRole("listitem")).toHaveLength(2)
    const details = within(document)
      .getByText("展开剧透")
      .closest("details") as HTMLElement
    expect(details).toHaveAttribute("open")
    await user.click(within(details).getByText("展开剧透"))
    expect(details).not.toHaveAttribute("open")
  })

  it("keeps structured entries on the legacy classic card grid", async () => {
    installFetchMock().mockResolvedValue(Response.json(makeWikiPublicStories()))
    renderPage(<ClassicStoryPage />, { route: ROUTE })

    expect(
      await screen.findByRole("button", { name: /【初星】/ })
    ).toBeVisible()
    expect(screen.queryByTestId("wiki-document")).not.toBeInTheDocument()
  })
})
