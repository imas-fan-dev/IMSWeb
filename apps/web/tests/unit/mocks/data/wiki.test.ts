import {
  wikiAdminAgencySchema,
  wikiAdminCatalogSchema,
  wikiAdminGroupSchema,
  wikiAdminIdolSchema,
  wikiAdminStoriesSchema,
  wikiAdminStorySchema,
  wikiCategorySchema,
  wikiImageTransformSchema,
  wikiPublicAgencySchema,
  wikiPublicCatalogSchema,
  wikiPublicGroupSchema,
  wikiPublicIdolSchema,
  wikiPublicStoriesSchema,
  wikiPublicStoryCardSchema,
  wikiPublicStoryLinkSchema,
  wikiRandomBackgroundSchema,
  wikiRandomIdolSchema,
  wikiStoryCoverAssetSchema,
  wikiStoryContentTypeSchema,
  wikiStorySourcePlatformSchema,
} from "@imsweb/contracts/wiki"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import {
  makeWikiAdminAgency,
  makeWikiAdminCatalog,
  makeWikiAdminGroup,
  makeWikiAdminIdol,
  makeWikiAdminStories,
  makeWikiAdminStory,
  makeWikiCategory,
  makeWikiImageTransform,
  makeWikiPublicAgency,
  makeWikiPublicCatalog,
  makeWikiPublicGroup,
  makeWikiPublicIdol,
  makeWikiPublicStories,
  makeWikiPublicStoryCard,
  makeWikiPublicStoryLink,
  makeWikiRandomBackground,
  makeWikiRandomIdol,
  makeWikiStoryCoverAsset,
  makeWikiStoryContentType,
  makeWikiStorySourcePlatform,
} from "@/mocks/data/wiki"

describe("wiki fixture factories", () => {
  it("builds an image transform that matches its contract", () => {
    const value = makeWikiImageTransform()

    assertFactoryCoversSchema(wikiImageTransformSchema, value)
    expect(wikiImageTransformSchema.parse(value)).toEqual(value)
  })

  it("builds a public agency that matches its contract", () => {
    const value = makeWikiPublicAgency()

    assertFactoryCoversSchema(wikiPublicAgencySchema, value)
    expect(wikiPublicAgencySchema.parse(value)).toEqual(value)
  })

  it("builds a public idol that matches its contract", () => {
    const value = makeWikiPublicIdol()

    assertFactoryCoversSchema(wikiPublicIdolSchema, value)
    expect(wikiPublicIdolSchema.parse(value)).toEqual(value)
  })

  it("builds a public group that matches its contract", () => {
    const value = makeWikiPublicGroup()

    assertFactoryCoversSchema(wikiPublicGroupSchema, value)
    expect(wikiPublicGroupSchema.parse(value)).toEqual(value)
  })

  it("builds a public story link that matches its contract", () => {
    const value = makeWikiPublicStoryLink()

    assertFactoryCoversSchema(wikiPublicStoryLinkSchema, value)
    expect(wikiPublicStoryLinkSchema.parse(value)).toEqual(value)
  })

  it("builds a public story card that matches its contract", () => {
    const value = makeWikiPublicStoryCard()

    assertFactoryCoversSchema(wikiPublicStoryCardSchema, value)
    expect(wikiPublicStoryCardSchema.parse(value)).toEqual(value)
  })

  it("builds a public catalog that matches its contract", () => {
    const value = makeWikiPublicCatalog()

    assertFactoryCoversSchema(wikiPublicCatalogSchema, value)
    expect(wikiPublicCatalogSchema.parse(value)).toEqual(value)
  })

  it("builds public stories that match their contract", () => {
    const value = makeWikiPublicStories()

    assertFactoryCoversSchema(wikiPublicStoriesSchema, value)
    expect(wikiPublicStoriesSchema.parse(value)).toEqual(value)
  })

  it("builds a random background that matches its contract", () => {
    const value = makeWikiRandomBackground()

    assertFactoryCoversSchema(wikiRandomBackgroundSchema, value)
    expect(wikiRandomBackgroundSchema.parse(value)).toEqual(value)
  })

  it("builds a random idol that matches its contract", () => {
    const value = makeWikiRandomIdol()

    assertFactoryCoversSchema(wikiRandomIdolSchema, value)
    expect(wikiRandomIdolSchema.parse(value)).toEqual(value)
  })

  it("builds a category that matches its contract", () => {
    const value = makeWikiCategory()

    assertFactoryCoversSchema(wikiCategorySchema, value)
    expect(wikiCategorySchema.parse(value)).toEqual(value)
  })

  it("builds an admin agency that matches its contract", () => {
    const value = makeWikiAdminAgency()

    assertFactoryCoversSchema(wikiAdminAgencySchema, value)
    expect(wikiAdminAgencySchema.parse(value)).toEqual(value)
  })

  it("builds an admin group that matches its contract", () => {
    const value = makeWikiAdminGroup()

    assertFactoryCoversSchema(wikiAdminGroupSchema, value)
    expect(wikiAdminGroupSchema.parse(value)).toEqual(value)
  })

  it("builds an admin idol that matches its contract", () => {
    const value = makeWikiAdminIdol()

    assertFactoryCoversSchema(wikiAdminIdolSchema, value)
    expect(wikiAdminIdolSchema.parse(value)).toEqual(value)
  })

  it("builds an admin story that matches its contract", () => {
    const value = makeWikiAdminStory()

    assertFactoryCoversSchema(wikiAdminStorySchema, value)
    expect(wikiAdminStorySchema.parse(value)).toEqual(value)
  })

  it("builds a story cover asset that matches its contract", () => {
    const value = makeWikiStoryCoverAsset()

    assertFactoryCoversSchema(wikiStoryCoverAssetSchema, value)
    expect(wikiStoryCoverAssetSchema.parse(value)).toEqual(value)
  })

  it("builds a story content type that matches its contract", () => {
    const value = makeWikiStoryContentType()

    assertFactoryCoversSchema(wikiStoryContentTypeSchema, value)
    expect(wikiStoryContentTypeSchema.parse(value)).toEqual(value)
  })

  it("builds a story source platform that matches its contract", () => {
    const value = makeWikiStorySourcePlatform()

    assertFactoryCoversSchema(wikiStorySourcePlatformSchema, value)
    expect(wikiStorySourcePlatformSchema.parse(value)).toEqual(value)
  })

  it("builds an admin catalog that matches its contract", () => {
    const value = makeWikiAdminCatalog()

    assertFactoryCoversSchema(wikiAdminCatalogSchema, value)
    expect(wikiAdminCatalogSchema.parse(value)).toEqual(value)
  })

  it("builds admin stories that match their contract", () => {
    const value = makeWikiAdminStories()

    assertFactoryCoversSchema(wikiAdminStoriesSchema, value)
    expect(wikiAdminStoriesSchema.parse(value)).toEqual(value)
  })

  it("layers overrides over the defaults without dropping nested keys", () => {
    const value = makeWikiPublicCatalog({
      agencies: [makeWikiPublicAgency({ id: 7 })],
      selection: {
        agency: makeWikiPublicAgency({ id: 7 }),
        layoutRevision: 9,
        groups: [makeWikiPublicGroup({ id: 70 })],
        ungroupedIdols: [],
      },
    })

    expect(value.agencies[0]?.id).toBe(7)
    expect(value.selection?.layoutRevision).toBe(9)
    assertFactoryCoversSchema(wikiPublicCatalogSchema, value)
    expect(wikiPublicCatalogSchema.parse(value)).toEqual(value)
  })
})
