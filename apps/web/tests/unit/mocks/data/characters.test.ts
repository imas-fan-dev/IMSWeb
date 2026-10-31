import {
  namecardCharacterCatalogEntrySchema,
  namecardCharacterCatalogSchema,
  namecardCharacterCatalogUnitSchema,
} from "@imsweb/contracts/fudaba/characters"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import {
  makeNamecardCharacterCatalog,
  makeNamecardCharacterCatalogEntry,
  makeNamecardCharacterCatalogUnit,
} from "@/mocks/data/characters"

describe("character catalog fixture factories", () => {
  it("builds a catalog entry that matches its contract", () => {
    const value = makeNamecardCharacterCatalogEntry()

    assertFactoryCoversSchema(namecardCharacterCatalogEntrySchema, value)
    expect(namecardCharacterCatalogEntrySchema.parse(value)).toEqual(value)
  })

  it("builds a unit that matches its contract", () => {
    const value = makeNamecardCharacterCatalogUnit()

    assertFactoryCoversSchema(namecardCharacterCatalogUnitSchema, value)
    expect(namecardCharacterCatalogUnitSchema.parse(value)).toEqual(value)
  })

  it("builds a catalog that matches its contract", () => {
    const value = makeNamecardCharacterCatalog()

    assertFactoryCoversSchema(namecardCharacterCatalogSchema, value)
    expect(namecardCharacterCatalogSchema.parse(value)).toEqual(value)
  })

  it("files every character under an agency the catalog declares", () => {
    const value = makeNamecardCharacterCatalog()

    const codes = new Set(value.agencies.map((agency) => agency.code))
    for (const entry of value.characters) {
      expect(codes.has(entry.agencyCode)).toBe(true)
    }
  })

  it("carries a fallback bucket so the picker always has a last resort", () => {
    const value = makeNamecardCharacterCatalog()

    expect(value.characters.filter((entry) => entry.isFallback).length).toBeGreaterThan(0)
  })

  it("layers overrides over the defaults without dropping nested keys", () => {
    const value = makeNamecardCharacterCatalog({
      characters: [makeNamecardCharacterCatalogEntry({ id: 9, nameCn: "制作人" })],
    })

    expect(value.characters[0]?.nameCn).toBe("制作人")
    assertFactoryCoversSchema(namecardCharacterCatalogSchema, value)
    expect(namecardCharacterCatalogSchema.parse(value)).toEqual(value)
  })
})
