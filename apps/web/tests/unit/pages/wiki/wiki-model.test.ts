import { describe, expect, it } from "vitest"

import {
  contrastingWikiText,
  readableWikiAccent,
} from "~/pages/wiki/wiki-model"

describe("Wiki color contrast", () => {
  it("darkens pale accents used as text on white surfaces", () => {
    expect(readableWikiAccent("#dffaff")).not.toBe("#dffaff")
    expect(readableWikiAccent("#202126")).toBe("#202126")
  })

  it("selects a contrasting foreground for colored surfaces", () => {
    expect(contrastingWikiText("#dffaff", "#ffffff")).toBe("#202126")
    expect(contrastingWikiText("#202126", "#ffffff")).toBe("#ffffff")
    expect(contrastingWikiText("#ffd700", "#111111")).toBe("#111111")
  })
})
