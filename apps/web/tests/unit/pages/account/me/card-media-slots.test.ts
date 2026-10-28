import { describe, expect, it } from "vitest"
import { middlePageSlotOrder } from "~/pages/account/me/namecards/card-media-slots"

describe("middlePageSlotOrder", () => {
  it("repeats the front and the back by reference when nothing changed", () => {
    expect(middlePageSlotOrder([], 0, true)).toEqual(["#0", "#1"])
    expect(middlePageSlotOrder(["#0", "#1"], 2, true)).toEqual([
      "#0",
      "#1",
      "#2",
      "#3",
    ])
  })

  it("keeps middle pages after the front and moves the back to the end", () => {
    // Slot 0 is the front, slots 1.. are middle pages, the back closes the list,
    // so inserting a file shifts every middle page by one.
    expect(middlePageSlotOrder(["#0", "@0", "#1"], 2, true)).toEqual([
      "#0",
      "#1",
      "@0",
      "#2",
      "#3",
    ])
  })

  it("drops the back reference when the card has no back image", () => {
    expect(middlePageSlotOrder([], 0, false)).toEqual(["#0"])
  })
})
