import {
  informationCardSchema,
  informationDetailSchema,
  informationListSchema,
} from "@imsweb/contracts/information"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import {
  makeInformationCard,
  makeInformationDetail,
  makeInformationList,
} from "@/mocks/data/information"

describe("information fixture factories", () => {
  it("builds a card that matches its contract", () => {
    const value = makeInformationCard()

    assertFactoryCoversSchema(informationCardSchema, value)
    expect(informationCardSchema.parse(value)).toEqual(value)
  })

  it("builds a list that matches its contract", () => {
    const value = makeInformationList()

    assertFactoryCoversSchema(informationListSchema, value)
    expect(informationListSchema.parse(value)).toEqual(value)
  })

  it("layers overrides over the defaults", () => {
    const value = makeInformationList({
      cards: [makeInformationCard({ id: "info-9", category: "fan" })],
    })

    expect(value.cards[0]?.id).toBe("info-9")
    assertFactoryCoversSchema(informationListSchema, value)
    expect(informationListSchema.parse(value)).toEqual(value)
  })

  it("builds a detail response for the id it was asked for", () => {
    const value = makeInformationDetail("info-42")

    expect(value.card.id).toBe("info-42")
    assertFactoryCoversSchema(informationDetailSchema, value)
    expect(informationDetailSchema.parse(value)).toEqual(value)
  })
})
