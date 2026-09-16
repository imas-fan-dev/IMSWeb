import {
  fudabaCardPageSchema,
  fudabaCardSchema,
  fudabaOfficeDetailSchema,
  fudabaOfficePageSchema,
  fudabaOfficeSchema,
  fudabaOwnerCardListSchema,
  fudabaOwnerCardSchema,
  fudabaOwnerOfficeListSchema,
  fudabaOwnerOfficeSchema,
  fudabaPlacedCardSchema,
  fudabaSeriesListSchema,
  fudabaSeriesSchema,
} from "@imsweb/contracts/fudaba"
import {
  fudabaAdminCardClaimSchema,
  fudabaRegisteredCardReviewSchema,
} from "@imsweb/contracts/fudaba/card-claims"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import {
  makeFudabaAdminCardClaim,
  makeFudabaCard,
  makeFudabaCardPage,
  makeFudabaOffice,
  makeFudabaOfficeDetail,
  makeFudabaOfficePage,
  makeFudabaOwnerCard,
  makeFudabaOwnerCardList,
  makeFudabaOwnerOffice,
  makeFudabaOwnerOfficeList,
  makeFudabaPlacedCard,
  makeFudabaRegisteredCardReview,
  makeFudabaSeries,
  makeFudabaSeriesList,
} from "@/mocks/data/fudaba"

// The detail schema wraps its office in an envelope, while the fixture type is
// the office itself. Reaching for the inner schema keeps the factory keyed to
// the shape media-urls.test.ts already holds.
const officeWithCardsSchema = fudabaOfficeDetailSchema.shape.office

describe("fudaba fixture factories", () => {
  it("builds a series that matches its contract", () => {
    const value = makeFudabaSeries()

    assertFactoryCoversSchema(fudabaSeriesSchema, value)
    expect(fudabaSeriesSchema.parse(value)).toEqual(value)
  })

  it("builds a series list that matches its contract", () => {
    const value = makeFudabaSeriesList()

    assertFactoryCoversSchema(fudabaSeriesListSchema, value)
    expect(fudabaSeriesListSchema.parse(value)).toEqual(value)
  })

  it("builds a card that matches its contract", () => {
    const value = makeFudabaCard()

    assertFactoryCoversSchema(fudabaCardSchema, value)
    expect(fudabaCardSchema.parse(value)).toEqual(value)
  })

  it("builds a card page that matches its contract", () => {
    const value = makeFudabaCardPage()

    assertFactoryCoversSchema(fudabaCardPageSchema, value)
    expect(fudabaCardPageSchema.parse(value)).toEqual(value)
  })

  it("builds an office that matches its contract", () => {
    const value = makeFudabaOffice()

    assertFactoryCoversSchema(fudabaOfficeSchema, value)
    expect(fudabaOfficeSchema.parse(value)).toEqual(value)
  })

  it("builds an office page that matches its contract", () => {
    const value = makeFudabaOfficePage()

    assertFactoryCoversSchema(fudabaOfficePageSchema, value)
    expect(fudabaOfficePageSchema.parse(value)).toEqual(value)
  })

  it("builds an office detail that matches its contract", () => {
    const value = makeFudabaOfficeDetail()

    assertFactoryCoversSchema(officeWithCardsSchema, value)
    expect(officeWithCardsSchema.parse(value)).toEqual(value)
  })

  it("builds an owner card list that matches its contract", () => {
    const value = makeFudabaOwnerCardList()

    assertFactoryCoversSchema(fudabaOwnerCardListSchema, value)
    expect(fudabaOwnerCardListSchema.parse(value)).toEqual(value)
  })

  it("builds an owner office list that matches its contract", () => {
    const value = makeFudabaOwnerOfficeList()

    assertFactoryCoversSchema(fudabaOwnerOfficeListSchema, value)
    expect(fudabaOwnerOfficeListSchema.parse(value)).toEqual(value)
  })

  it("builds an owner card that matches its contract", () => {
    const value = makeFudabaOwnerCard()

    assertFactoryCoversSchema(fudabaOwnerCardSchema, value)
    expect(fudabaOwnerCardSchema.parse(value)).toEqual(value)
  })

  it("builds an owner office that matches its contract", () => {
    const value = makeFudabaOwnerOffice()

    assertFactoryCoversSchema(fudabaOwnerOfficeSchema, value)
    expect(fudabaOwnerOfficeSchema.parse(value)).toEqual(value)
  })

  it("builds a placed card that matches its contract", () => {
    const value = makeFudabaPlacedCard()

    assertFactoryCoversSchema(fudabaPlacedCardSchema, value)
    expect(fudabaPlacedCardSchema.parse(value)).toEqual(value)
  })

  it("builds a registered card review that matches its contract", () => {
    const value = makeFudabaRegisteredCardReview()

    assertFactoryCoversSchema(fudabaRegisteredCardReviewSchema, value)
    expect(fudabaRegisteredCardReviewSchema.parse(value)).toEqual(value)
  })

  it("builds an admin card claim that matches its contract", () => {
    const value = makeFudabaAdminCardClaim()

    assertFactoryCoversSchema(fudabaAdminCardClaimSchema, value)
    expect(fudabaAdminCardClaimSchema.parse(value)).toEqual(value)
  })

  it("layers overrides over the defaults without dropping nested keys", () => {
    const value = makeFudabaCardPage({
      items: [makeFudabaCard({ id: "card-9", displayName: "改名" })],
      pageInfo: { hasNextPage: true, nextCursor: "cursor-2" },
    })

    expect(value.items[0]?.id).toBe("card-9")
    expect(value.pageInfo.nextCursor).toBe("cursor-2")
    assertFactoryCoversSchema(fudabaCardPageSchema, value)
    expect(fudabaCardPageSchema.parse(value)).toEqual(value)
  })
})
