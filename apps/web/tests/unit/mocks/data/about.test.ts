import {
  aboutGroupSchema,
  aboutPageContentSchema,
  aboutPersonSchema,
} from "@imsweb/contracts/about"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import { makeAboutGroup, makeAboutPageContent, makeAboutPerson } from "@/mocks/data/about"

describe("about fixture factories", () => {
  it("builds a person that matches its contract", () => {
    const value = makeAboutPerson()

    assertFactoryCoversSchema(aboutPersonSchema, value)
    expect(aboutPersonSchema.parse(value)).toEqual(value)
  })

  it("builds a group that matches its contract", () => {
    const value = makeAboutGroup()

    assertFactoryCoversSchema(aboutGroupSchema, value)
    expect(aboutGroupSchema.parse(value)).toEqual(value)
  })

  it("builds page content that matches its contract", () => {
    const value = makeAboutPageContent()

    assertFactoryCoversSchema(aboutPageContentSchema, value)
    expect(aboutPageContentSchema.parse(value)).toEqual(value)
  })

  it("layers overrides over the defaults without dropping nested keys", () => {
    const value = makeAboutPageContent({
      groups: [
        makeAboutGroup({
          id: "staff",
          people: [makeAboutPerson({ id: "p9", profileUrl: null })],
        }),
      ],
      // The content schema's `updatedAt` has no offset flag, so it only
      // accepts the UTC form.
      updatedAt: "2026-01-01T00:00:00Z",
    })

    expect(value.groups[0]?.people[0]?.profileUrl).toBe(null)
    expect(value.updatedAt).toBe("2026-01-01T00:00:00Z")
    assertFactoryCoversSchema(aboutPageContentSchema, value)
    expect(aboutPageContentSchema.parse(value)).toEqual(value)
  })
})
