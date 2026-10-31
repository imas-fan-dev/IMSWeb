import {
  editorialArticleSchema,
  editorialChroniclePageSchema,
  editorialLegacyInformationSchema,
  editorialSpotlightItemSchema,
  editorialSpotlightSchema,
} from "@imsweb/contracts/editorial"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import {
  makeEditorialArticle,
  makeEditorialChroniclePage,
  makeEditorialLegacyInformation,
  makeEditorialSpotlight,
  makeEditorialSpotlightItem,
} from "@/mocks/data/editorial"

describe("editorial fixture factories", () => {
  it("builds an article that matches its contract", () => {
    const value = makeEditorialArticle()

    assertFactoryCoversSchema(editorialArticleSchema, value)
    expect(editorialArticleSchema.parse(value)).toEqual(value)
  })

  it("builds a chronicle page that matches its contract", () => {
    const value = makeEditorialChroniclePage()

    assertFactoryCoversSchema(editorialChroniclePageSchema, value)
    expect(editorialChroniclePageSchema.parse(value)).toEqual(value)
  })

  it("carries the fields a published chronicle entry always has", () => {
    // `set-entry-status` rejects publishing a chronicle entry without both
    // `occurred_on` and `source_type`, the chronicle list buckets items into
    // lanes by `source_type`, and the detail page labels its badge from the same
    // field. Every one of them is optional in the contract, so a fixture that
    // drops them still parses and still passes the conformance check — it just
    // renders an empty timeline.
    const [item] = makeEditorialChroniclePage().items

    expect(["official", "community"]).toContain(item?.source_type)
    expect(item?.article_id).toBeTruthy()
    expect(item?.occurred_on).toBeTruthy()
    expect(item?.date_precision).toBeTruthy()
  })

  it("builds a spotlight item that matches its contract", () => {
    const value = makeEditorialSpotlightItem()

    assertFactoryCoversSchema(editorialSpotlightItemSchema, value)
    expect(editorialSpotlightItemSchema.parse(value)).toEqual(value)
  })

  it("builds a spotlight response that matches its contract", () => {
    const value = makeEditorialSpotlight()

    assertFactoryCoversSchema(editorialSpotlightSchema, value)
    expect(editorialSpotlightSchema.parse(value)).toEqual(value)
  })

  it("layers overrides over the defaults", () => {
    const value = makeEditorialChroniclePage({
      items: [makeEditorialArticle({ id: 9, status: "draft" })],
      pageInfo: { hasNextPage: true, nextCursor: "next-1" },
    })

    expect(value.items[0]?.status).toBe("draft")
    expect(value.pageInfo.nextCursor).toBe("next-1")
    assertFactoryCoversSchema(editorialChroniclePageSchema, value)
    expect(editorialChroniclePageSchema.parse(value)).toEqual(value)
  })

  it("builds a legacy-information response that matches its contract", () => {
    const value = makeEditorialLegacyInformation(42)

    expect(value.postId).toBe(42)
    assertFactoryCoversSchema(editorialLegacyInformationSchema, value)
    expect(editorialLegacyInformationSchema.parse(value)).toEqual(value)
  })

  it("reports a null post id when a legacy slug resolves to nothing", () => {
    const value = makeEditorialLegacyInformation(null)

    expect(value.postId).toBe(null)
    assertFactoryCoversSchema(editorialLegacyInformationSchema, value)
    expect(editorialLegacyInformationSchema.parse(value)).toEqual(value)
  })
})
