import {
  producerMapCommunitySchema,
  producerMapContentSchema,
  producerMapRegionSchema,
} from "@imsweb/contracts/producer-map"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import {
  makeProducerMapCommunity,
  makeProducerMapContent,
  makeProducerMapRegion,
} from "@/mocks/data/producer-map"

describe("producer-map fixture factories", () => {
  it("builds a region that matches its contract", () => {
    const value = makeProducerMapRegion()

    assertFactoryCoversSchema(producerMapRegionSchema, value)
    expect(producerMapRegionSchema.parse(value)).toEqual(value)
  })

  it("builds a community that matches its contract", () => {
    const value = makeProducerMapCommunity()

    assertFactoryCoversSchema(producerMapCommunitySchema, value)
    expect(producerMapCommunitySchema.parse(value)).toEqual(value)
  })

  it("builds content that matches its contract", () => {
    const value = makeProducerMapContent()

    assertFactoryCoversSchema(producerMapContentSchema, value)
    expect(producerMapContentSchema.parse(value)).toEqual(value)
  })

  it("layers overrides over the defaults without dropping nested keys", () => {
    const value = makeProducerMapContent({
      regions: [
        makeProducerMapRegion({ id: "bj", province: "北京", imageUrl: null }),
      ],
    })

    expect(value.regions[0]?.id).toBe("bj")
    expect(value.regions[0]?.imageUrl).toBe(null)
    assertFactoryCoversSchema(producerMapContentSchema, value)
    expect(producerMapContentSchema.parse(value)).toEqual(value)
  })
})
