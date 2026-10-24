import type {
  ChronicleActivity,
  ChronicleActivitySummary,
} from "@imsweb/contracts/chronicle"
import { publicAssetsPath } from "@imsweb/contracts/paths"

/**
 * Chronicle photos live under the public-assets prefix, not under `/chronicle`:
 * the API composes them with
 * `publicAssetsPath('/images/eventchronicle/events/<bucket>/<id>/<file>')`
 * (`apps/api/src/domains/content/chronicle/chronicle-records.ts`). The activity
 * page renders them with `object-cover`, so the path shape has to be the real
 * one for a mocked page to lay out the way the served page does.
 */
function chronicleMedia(activityId: string, filename: string): string {
  const id = encodeURIComponent(activityId)
  const file = encodeURIComponent(filename)
  return publicAssetsPath(`/images/eventchronicle/events/used/${id}/${file}`)
}

export function makeChronicleActivitySummary(
  overrides: Partial<ChronicleActivitySummary> = {}
): ChronicleActivitySummary {
  return {
    id: "activity-1",
    title: "线下交流会",
    date: "2026-07-24",
    location: "广州",
    cover: chronicleMedia("activity-1", "cover.webp"),
    ...overrides,
  }
}

export function makeChronicleActivity(
  overrides: Partial<ChronicleActivity> = {}
): ChronicleActivity {
  return {
    id: "activity-1",
    title: "线下交流会",
    date: "2026-07-24",
    location: "广州",
    images: [
      chronicleMedia("activity-1", "a.webp"),
      chronicleMedia("activity-1", "b.webp"),
    ],
    ...overrides,
  }
}
