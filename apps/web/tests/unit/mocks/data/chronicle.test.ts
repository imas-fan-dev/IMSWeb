import {
  chronicleActivitySchema,
  chronicleActivitySummarySchema,
} from "@imsweb/contracts/chronicle"
import { describe, expect, it } from "vitest"

import {
  makeChronicleActivity,
  makeChronicleActivitySummary,
} from "@/mocks/data/chronicle"
import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"

describe("chronicle fixture factories", () => {
  it("builds a summary that matches its contract", () => {
    const summary = makeChronicleActivitySummary()

    assertFactoryCoversSchema(chronicleActivitySummarySchema, summary)
    expect(chronicleActivitySummarySchema.parse(summary)).toEqual(summary)
  })

  it("builds an activity that matches its contract", () => {
    const activity = makeChronicleActivity()

    assertFactoryCoversSchema(chronicleActivitySchema, activity)
    expect(chronicleActivitySchema.parse(activity)).toEqual(activity)
  })

  it("layers overrides over the defaults", () => {
    const summary = makeChronicleActivitySummary({
      cover: null,
      id: "activity-9",
    })

    expect(summary).toMatchObject({ cover: null, id: "activity-9" })
    expect(summary.title).toBe("线下交流会")
    assertFactoryCoversSchema(chronicleActivitySummarySchema, summary)
    expect(chronicleActivitySummarySchema.parse(summary)).toEqual(summary)
  })
})
