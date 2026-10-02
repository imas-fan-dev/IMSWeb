import {
  namecardIdolSchema,
  namecardPageSchema,
  namecardSchema,
} from "@imsweb/contracts/namecards"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import { makeNamecard, makeNamecardIdol, makeNamecardPage } from "@/mocks/data/namecards"

describe("namecards fixture factories", () => {
  it("builds an idol that matches its contract", () => {
    const value = makeNamecardIdol()

    assertFactoryCoversSchema(namecardIdolSchema, value)
    expect(namecardIdolSchema.parse(value)).toEqual(value)
  })

  it("builds a namecard that matches its contract", () => {
    const value = makeNamecard()

    assertFactoryCoversSchema(namecardSchema, value)
    expect(namecardSchema.parse(value)).toEqual(value)
  })

  it("builds a namecard page that matches its contract", () => {
    const value = makeNamecardPage()

    assertFactoryCoversSchema(namecardPageSchema, value)
    expect(namecardPageSchema.parse(value)).toEqual(value)
  })

  it("layers overrides over the defaults without dropping nested keys", () => {
    const value = makeNamecard({
      id: 9,
      favoriteIdols: [makeNamecardIdol({ id: 3, name: "如月千早" })],
      claimStatus: "claimed",
    })

    expect(value.id).toBe(9)
    expect(value.claimStatus).toBe("claimed")
    assertFactoryCoversSchema(namecardSchema, value)
    expect(namecardSchema.parse(value)).toEqual(value)
  })
})
