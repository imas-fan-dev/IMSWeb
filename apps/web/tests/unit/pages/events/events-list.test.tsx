import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import { EventRow } from "~/pages/events/components/events-list"
import type { EventListItem } from "~/lib/api"

function event(image_url: EventListItem["image_url"]): EventListItem {
  return {
    id: "1",
    title: "夏日活动",
    name: "活动发布者",
    contact: null,
    image_url,
    created_at: null,
    cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
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
})
