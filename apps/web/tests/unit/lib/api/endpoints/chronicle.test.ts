import { describe, expect, it } from "vitest"

import {
  chronicleActivitySchema,
  chronicleActivitySummarySchema,
} from "~/lib/api/endpoints/chronicle"

describe("chronicle API contracts", () => {
  it("accepts the public activity summary returned by Hono", () => {
    expect(
      chronicleActivitySummarySchema.parse({
        id: "activity-1",
        title: "线下交流活动",
        date: "2026-07-24",
        location: "广州",
        cover: null,
      })
    ).toMatchObject({ id: "activity-1", cover: null })
  })

  it("rejects unsafe or incomplete activity payloads", () => {
    expect(() =>
      chronicleActivitySchema.parse({
        id: "",
        title: "活动",
        date: "待定",
        location: "待补充",
        images: [],
      })
    ).toThrow()
  })
})
