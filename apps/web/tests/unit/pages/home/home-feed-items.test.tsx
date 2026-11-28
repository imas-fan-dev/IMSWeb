import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { makeEventListItem } from "@/mocks/data/events"
import { renderPage } from "@/tests/unit/support/harness"
import { HomeEventRow } from "~/pages/home/components/home-feed-items"

function renderRow(event = makeEventListItem()) {
  return renderPage(<HomeEventRow event={event} />)
}

describe("HomeEventRow", () => {
  it("opens a body-less external source directly", () => {
    renderRow(
      makeEventListItem({
        title: "仅标题动态",
        has_body: false,
        source_url: "https://example.test/original",
      })
    )

    const link = screen.getByRole("link", { name: /仅标题动态/ })
    expect(link).toHaveAttribute("href", "https://example.test/original")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noreferrer")
  })

  it("keeps the detail route when the post has a body", () => {
    renderRow(
      makeEventListItem({
        id: 5,
        title: "有正文动态",
        has_body: true,
        source_url: "https://example.test/original",
      })
    )

    expect(screen.getByRole("link", { name: /有正文动态/ })).toHaveAttribute(
      "href",
      "/events/5"
    )
  })

  it("keeps a root-relative source in the same tab", () => {
    renderRow(
      makeEventListItem({
        id: 6,
        title: "站内来源动态",
        has_body: false,
        source_url: "/notices/6",
      })
    )

    const link = screen.getByRole("link", { name: /站内来源动态/ })
    expect(link).toHaveAttribute("href", "/notices/6")
    expect(link).not.toHaveAttribute("target")
  })
})
