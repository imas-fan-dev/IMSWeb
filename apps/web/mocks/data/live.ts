import type { LiveEvent, LiveScheduleList } from "@imsweb/contracts/live"

/**
 * Factories for the live schedule page. `app/lib/api/endpoints/live.ts` parses
 * `GET /api/live-schedule` with `liveScheduleListSchema`, a bare array.
 */
export function makeLiveEvent(
  overrides: Partial<LiveEvent> = {}
): LiveEvent {
  return {
    id: "live-1",
    year: 2026,
    month: 7,
    day: 24,
    title: "夏日 live",
    time: "13:00",
    location: "广州",
    detailUrl: "https://example.com/live-1",
    image: "/uploads/live/live-1.webp",
    franchises: ["765"],
    brandCodes: ["765"],
    ...overrides,
  }
}

export function makeLiveScheduleList(
  overrides: Partial<LiveEvent> = {}
): LiveScheduleList {
  return [makeLiveEvent(overrides)]
}
