import {
  chronicleActivityListSchema,
  chronicleActivitySummarySchema,
} from "@imsweb/contracts/chronicle"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema, requiredKeysOf } from "@/mocks/data/schema-conformance"
import { makeChronicleActivitySummary } from "@/mocks/data/chronicle"

describe("requiredKeysOf", () => {
  it("lists the required keys of a ZodObject", () => {
    expect(requiredKeysOf(chronicleActivitySummarySchema)).toEqual([
      "cover",
      "date",
      "id",
      "location",
      "title",
    ])
  })

  it("returns null when the schema has no key set to enumerate", () => {
    expect(requiredKeysOf(chronicleActivityListSchema)).toBeNull()
    expect(requiredKeysOf(undefined)).toBeNull()
    expect(requiredKeysOf({ status: "success" })).toBeNull()
  })
})

describe("assertFactoryCoversSchema", () => {
  it("accepts a factory output that covers every required key", () => {
    expect(() =>
      assertFactoryCoversSchema(
        chronicleActivitySummarySchema,
        makeChronicleActivitySummary()
      )
    ).not.toThrow()
  })

  // The reverse verification for this task: dropping a required key has to
  // fail. Both signals are asserted, because the helper is only useful if it
  // stays stricter than the schema it sits beside.
  it("rejects a factory output that drops a required key", () => {
    const withoutTitle: Record<string, unknown> = {
      ...makeChronicleActivitySummary(),
    }
    delete withoutTitle.title

    expect(() =>
      assertFactoryCoversSchema(chronicleActivitySummarySchema, withoutTitle)
    ).toThrow(/title/)
    expect(() => chronicleActivitySummarySchema.parse(withoutTitle)).toThrow()
  })

  it("names every missing key rather than the first one", () => {
    expect(() =>
      assertFactoryCoversSchema(chronicleActivitySummarySchema, {
        id: "activity-1",
      })
    ).toThrow(/cover, date, location, title/)
  })
})
