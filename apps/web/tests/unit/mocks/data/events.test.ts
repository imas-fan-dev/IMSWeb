import { eventListItemSchema, eventPageSchema } from "@imsweb/contracts/events"
import { describe, expect, it } from "vitest"

import { assertFactoryCoversSchema } from "@/mocks/data/schema-conformance"
import { makeEventListItem, makeEventPage } from "@/mocks/data/events"

describe("event fixture factories", () => {
  it("builds a list item that matches its contract", () => {
    const value = makeEventListItem()

    assertFactoryCoversSchema(eventListItemSchema, value)
    expect(eventListItemSchema.parse(value)).toEqual(value)
  })

  it("builds a page that matches its contract", () => {
    const value = makeEventPage()

    assertFactoryCoversSchema(eventPageSchema, value)
    expect(eventPageSchema.parse(value)).toEqual(value)
  })

  it("layers overrides over the defaults", () => {
    const value = makeEventPage({
      items: [makeEventListItem({ id: "9", title: null, kind: null })],
    })

    expect(value.items[0]?.id).toBe("9")
    expect(value.items[0]?.title).toBe(null)
    assertFactoryCoversSchema(eventPageSchema, value)
    expect(eventPageSchema.parse(value)).toEqual(value)
  })
})
