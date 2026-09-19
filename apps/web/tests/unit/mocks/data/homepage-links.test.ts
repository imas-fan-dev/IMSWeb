import {
  homepageLinkSchema,
  homepageLinksSchema,
} from "@imsweb/contracts/homepage-links"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import {
  makeHomepageLink,
  makeHomepageLinks,
} from "@/mocks/data/homepage-links"

describe("homepage link fixture factories", () => {
  it("builds a link that matches its contract", () => {
    const value = makeHomepageLink()

    assertFactoryCoversSchema(homepageLinkSchema, value)
    expect(homepageLinkSchema.parse(value)).toEqual(value)
  })

  it("builds all three sections", () => {
    const value = makeHomepageLinks()

    assertFactoryCoversSchema(homepageLinksSchema, value)
    expect(homepageLinksSchema.parse(value)).toEqual(value)
    expect(Object.keys(value.sections).sort()).toEqual([
      "friend",
      "navigation",
      "support",
    ])
  })

  it("layers overrides over the defaults", () => {
    const value = makeHomepageLinks({
      sections: {
        navigation: [],
        friend: [makeHomepageLink({ id: "friend-1", section: "friend" })],
        support: [],
      },
    })

    expect(value.sections.friend[0]?.section).toBe("friend")
    assertFactoryCoversSchema(homepageLinksSchema, value)
    expect(homepageLinksSchema.parse(value)).toEqual(value)
  })
})
