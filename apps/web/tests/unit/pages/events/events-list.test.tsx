import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import { EventRow, EventsSkeleton } from "~/pages/events/components/events-list"
import type { EventListItem } from "~/lib/api"

function event(
  image_url: EventListItem["image_url"],
  overrides: Partial<EventListItem> = {}
): EventListItem {
  return {
    id: "1",
    title: "夏日活动",
    name: "活动发布者",
    contact: null,
    image_url,
    created_at: null,
    cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
    ...overrides,
  }
}

describe("EventRow", () => {
  it("uses the normalized root-relative poster URL", () => {
    const { container } = render(
      <MemoryRouter>
        <EventRow event={event("/uploads/events/summer/poster.webp")} />
      </MemoryRouter>
    )

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/uploads/events/summer/poster.webp"
    )
  })

  it("rejects non-HTTP(S) poster URLs before rendering an image", () => {
    const { container } = render(
      <MemoryRouter>
        <EventRow event={event("data:image/svg+xml,<svg></svg>")} />
      </MemoryRouter>
    )

    expect(container.querySelector("img")).toBeNull()
  })

  it("contains long mobile copy in a centered, fixed-height information block", () => {
    const longValue = `https://example.test/${"long-segment".repeat(20)}`
    render(
      <MemoryRouter>
        <EventRow
          event={event(null, {
            kind: "event",
            title: longValue,
            summary: "列表中不应显示的摘要",
            name: "长文本发布者",
            contact: longValue,
          })}
        />
      </MemoryRouter>
    )

    const title = screen.getByRole("heading", { name: longValue })
    const category = screen.getByText("具体活动")
    const publisher = screen.getByText("长文本发布者")
    const date = screen.getByText("发布时间待补充")
    const contact = screen.getByText(longValue, { selector: "span" })
    const content = title.parentElement
    const publisherRow = publisher.parentElement
    const dateRow = date
    const contactRow = contact.parentElement

    expect(title).toHaveClass("line-clamp-1", "wrap-anywhere")
    expect(category).toBeVisible()
    expect(category.parentElement).toBe(content)
    expect(content).toHaveClass("justify-center", "overflow-hidden")
    expect(screen.queryByText("列表中不应显示的摘要")).not.toBeInTheDocument()
    expect(publisher).toHaveClass("truncate")
    expect(contact).toHaveClass("truncate")
    expect(publisherRow).not.toBe(dateRow)
    expect(dateRow).not.toBe(contactRow)
    expect(Array.from(dateRow?.parentElement?.children ?? [])).toEqual([
      publisherRow,
      dateRow,
      contactRow,
    ])
    expect(dateRow).not.toHaveClass(
      "absolute",
      "lg:absolute",
      "lg:right-3",
      "lg:bottom-3"
    )
    expect(contactRow).not.toHaveClass("lg:pr-40")
    expect(title.closest("article")).toHaveClass(
      "relative",
      "h-36",
      "grid-cols-[6.5rem_minmax(0,1fr)]",
      "gap-3",
      "p-3",
      "sm:grid-cols-[9rem_minmax(0,1fr)]",
      "sm:gap-4"
    )
  })

  it("keeps the category beside the text instead of overlaying the cover", () => {
    render(
      <MemoryRouter>
        <EventRow
          event={event("/uploads/events/summer/poster.webp", {
            kind: "notice",
          })}
        />
      </MemoryRouter>
    )

    const cover = screen.getByRole("img", {
      name: "夏日活动封面",
    }).parentElement
    const category = screen.getByText("社区动态")
    expect(cover).not.toContainElement(category)
    expect(category.parentElement).toBe(
      screen.getByRole("heading", { name: "夏日活动" }).parentElement
    )
  })

  it("uses the same fixed height and media tracks for skeleton and rows", () => {
    const { container } = render(
      <MemoryRouter>
        <EventRow event={event(null)} />
        <EventsSkeleton />
      </MemoryRouter>
    )

    const row = screen.getByRole("article")
    const skeleton = container.querySelector(
      '[aria-label="正在加载活动"] > div'
    )
    for (const className of [
      "h-36",
      "grid-cols-[6.5rem_minmax(0,1fr)]",
      "gap-3",
      "p-3",
      "sm:grid-cols-[9rem_minmax(0,1fr)]",
      "sm:gap-4",
    ]) {
      expect(row).toHaveClass(className)
      expect(skeleton).toHaveClass(className)
    }
    expect(row).toHaveClass("relative")
    expect(skeleton).not.toHaveClass("relative")
    expect(skeleton?.firstElementChild).toHaveClass("self-center")
    expect(skeleton?.lastElementChild).toHaveClass(
      "justify-center",
      "overflow-hidden"
    )
    const skeletonMetadata = skeleton?.lastElementChild?.lastElementChild
    const skeletonPublisherRow = skeletonMetadata?.children[0]
    const skeletonDateRow = skeletonMetadata?.children[1]
    const skeletonContactRow = skeletonMetadata?.children[2]
    expect(skeletonMetadata).toHaveClass("mt-1", "min-w-0")
    expect(skeletonDateRow).not.toHaveClass(
      "absolute",
      "lg:absolute",
      "lg:right-3",
      "lg:bottom-3"
    )
    expect(skeletonDateRow?.firstElementChild).toHaveClass("w-1/2")
    expect(skeletonDateRow?.firstElementChild).not.toHaveClass("lg:w-32")
    expect(skeletonContactRow).not.toHaveClass("lg:pr-40")
    expect(skeletonPublisherRow).not.toHaveClass("lg:pr-40")
  })
})
