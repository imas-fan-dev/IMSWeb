import { reactionSchema } from "@imsweb/contracts/namecards"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import { makeNamecardReactions } from "@/mocks/data/community"

describe("community reaction fixture factories", () => {
  it("builds counters that match the record contract", () => {
    const value = makeNamecardReactions()

    // A record has no required-key set to enumerate, so the parse carries the
    // contract check on its own.
    assertFactoryCoversSchema(reactionSchema, value)
    expect(reactionSchema.parse(value)).toEqual(value)
  })

  it("lets a caller replace the default counters", () => {
    const value = makeNamecardReactions({ "🎉": 7 })

    expect(value["🎉"]).toBe(7)
    expect(reactionSchema.parse(value)).toEqual(value)
  })
})
