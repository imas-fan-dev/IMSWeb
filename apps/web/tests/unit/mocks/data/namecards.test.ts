import {
  namecardCardLayoutSchema,
  namecardFavoriteCharacterSchema,
  namecardPageSchema,
  namecardSchema,
} from "@imsweb/contracts/namecards"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import {
  makeNamecard,
  makeNamecardCardLayout,
  makeNamecardFavoriteCharacter,
  makeNamecardPage,
} from "@/mocks/data/namecards"

describe("namecards fixture factories", () => {
  it("builds a profile layout that matches its contract", () => {
    const value = makeNamecardCardLayout({
      defaultCardNumbers: [2, 1],
      groups: [{ id: "g-1", title: "常用", cardNumbers: [3] }],
      quickCardNumbers: [2],
    })

    assertFactoryCoversSchema(namecardCardLayoutSchema, value)
    expect(namecardCardLayoutSchema.parse(value)).toEqual(value)
  })
  it("builds an idol that matches its contract", () => {
    const value = makeNamecardFavoriteCharacter()

    assertFactoryCoversSchema(namecardFavoriteCharacterSchema, value)
    expect(namecardFavoriteCharacterSchema.parse(value)).toEqual(value)
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
      favoriteCharacters: [makeNamecardFavoriteCharacter({ id: 3, name: "如月千早" })],
      claimStatus: "claimed",
    })

    expect(value.id).toBe(9)
    expect(value.claimStatus).toBe("claimed")
    assertFactoryCoversSchema(namecardSchema, value)
    expect(namecardSchema.parse(value)).toEqual(value)
  })
})
