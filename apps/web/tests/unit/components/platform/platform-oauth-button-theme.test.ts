import { describe, expect, it } from "vitest"

import { platformOAuthButtonStyle } from "~/components/platform/platform-oauth-button-theme"

describe("platformOAuthButtonStyle", () => {
  it("uses dark text on a light provider color", () => {
    expect(platformOAuthButtonStyle("#ffffff")).toEqual({
      backgroundColor: "#ffffff",
      borderColor: "#111111",
      color: "#111111",
    })
  })

  it("uses white text on a dark provider color", () => {
    expect(platformOAuthButtonStyle("#1166aa")).toEqual({
      backgroundColor: "#1166aa",
      borderColor: "#1166aa",
      color: "#ffffff",
    })
  })

  it("falls back to a safe dark color for invalid input", () => {
    expect(platformOAuthButtonStyle("not-a-color")).toEqual({
      backgroundColor: "#111827",
      borderColor: "#111827",
      color: "#ffffff",
    })
  })
})
