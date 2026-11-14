import type { EventListItem, EventPage } from "@imsweb/contracts/events"

/**
 * Factories for the public events feed. `app/lib/api/endpoints/events.ts`
 * parses `GET /api/events` with `eventPageSchema`, so the page shape here is
 * that contract's `{ items, pageInfo }` snapshot envelope.
 */
export function makeEventListItem(
  overrides: Partial<EventListItem> = {}
): EventListItem {
  return {
    id: 1,
    title: "夏日同好会",
    name: "夏日同好会",
    contact: null,
    image_url: "/uploads/events/summer/poster.webp",
    created_at: "2026-01-01T00:00:00+08:00",
    summary: "一起看 live",
    kind: "event",
    source_url: null,
    start_at: "2026-07-24T13:00:00+08:00",
    end_at: null,
    venue_name: "广州",
    event_status: "published",
    cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
    ...overrides,
  }
}

export function makeEventPage(overrides: Partial<EventPage> = {}): EventPage {
  return {
    items: [makeEventListItem()],
    pageInfo: { nextCursor: null, hasNextPage: false, snapshotAt: "1" },
    ...overrides,
  }
}
