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

  it("contains long mobile copy and exposes category text without hover", () => {
    const longValue = `https://example.test/${"long-segment".repeat(20)}`
    render(
      <MemoryRouter>
        <EventRow
          event={event(null, {
            kind: "event",
            title: longValue,
            summary: longValue,
            name: "长文本发布者",
            contact: longValue,
          })}
        />
      </MemoryRouter>
    )

    const title = screen.getByRole("heading", { name: longValue })
    expect(title).toHaveClass("line-clamp-2", "wrap-anywhere")
    expect(screen.getByText("具体活动")).toHaveClass(
      "opacity-100",
      "[@media(hover:hover)_and_(pointer:fine)]:opacity-0",
      "group-hover:opacity-100",
      "group-focus-visible:opacity-100"
    )
    expect(screen.getByText(longValue, { selector: "span" })).toHaveClass(
      "line-clamp-1",
      "break-all"
    )
    expect(screen.getByText("长文本发布者")).toHaveClass("truncate")
    expect(title.closest("article")).toHaveClass(
      "h-44",
      "grid-cols-[6.5rem_minmax(0,1fr)]",
      "sm:grid-cols-[10.5rem_minmax(0,1fr)]"
    )
  })

  it("uses the same fixed estimated height and media tracks for skeleton and rows", () => {
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
      "h-44",
      "grid-cols-[6.5rem_minmax(0,1fr)]",
      "gap-4",
      "p-4",
      "sm:grid-cols-[10.5rem_minmax(0,1fr)]",
      "sm:gap-5",
      "sm:px-5",
    ]) {
      expect(row).toHaveClass(className)
      expect(skeleton).toHaveClass(className)
    }
    expect(skeleton?.firstElementChild).toHaveClass("self-center")
  })
})
