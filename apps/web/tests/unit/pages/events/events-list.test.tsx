import { render } from "@testing-library/react"
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
  }
}

describe("EventRow", () => {
  it("uses the normalized root-relative poster URL", () => {
    const { container } = render(
      <EventRow event={event("/uploads/events/summer/poster.webp")} />
    )

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/uploads/events/summer/poster.webp"
    )
  })

  it("rejects non-HTTP(S) poster URLs before rendering an image", () => {
    const { container } = render(
      <EventRow event={event("data:image/svg+xml,<svg></svg>")} />
    )

    expect(container.querySelector("img")).toBeNull()
  })
})
