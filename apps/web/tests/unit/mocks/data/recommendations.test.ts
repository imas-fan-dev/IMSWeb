import {
  recommendationResponseSchema,
  recommendationSchema,
} from "@imsweb/contracts/news"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import {
  makeRecommendation,
  makeRecommendationPage,
} from "@/mocks/data/recommendations"

describe("recommendation fixture factories", () => {
  it("builds an item that matches its contract", () => {
    const value = makeRecommendation()

    assertFactoryCoversSchema(recommendationSchema, value)
    expect(recommendationSchema.parse(value)).toEqual(value)
  })

  it("builds the paginated response the endpoint parses", () => {
    const value = makeRecommendationPage()

    // The response contract is a union of this paginated shape and a bare
    // array, so it has no enumerable key set; the parse below is the check.
    assertFactoryCoversSchema(recommendationResponseSchema, value)
    expect(recommendationResponseSchema.parse(value)).toEqual(value)
  })

  it("layers overrides over the defaults", () => {
    const value = makeRecommendationPage({
      items: [makeRecommendation({ id: 9, thumbnail: null })],
    })

    expect(value.items[0]?.id).toBe(9)
    expect(value.items[0]?.thumbnail).toBe(null)
    expect(recommendationResponseSchema.parse(value)).toEqual(value)
  })
})
