import { liveEventSchema, liveScheduleListSchema } from "@imsweb/contracts/live"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import { makeLiveEvent, makeLiveScheduleList } from "@/mocks/data/live"

describe("live schedule fixture factories", () => {
  it("builds an event that matches its contract", () => {
    const value = makeLiveEvent()

    assertFactoryCoversSchema(liveEventSchema, value)
    expect(liveEventSchema.parse(value)).toEqual(value)
  })

  it("builds the bare array the endpoint parses", () => {
    const value = makeLiveScheduleList()

    // The schedule contract is an array, so it has no key set to enumerate.
    assertFactoryCoversSchema(liveScheduleListSchema, value)
    expect(liveScheduleListSchema.parse(value)).toEqual(value)
  })

  it("layers overrides over the defaults", () => {
    const value = makeLiveScheduleList({ id: "live-9", franchises: [] })

    expect(value[0]?.id).toBe("live-9")
    expect(liveScheduleListSchema.parse(value)).toEqual(value)
  })
})
