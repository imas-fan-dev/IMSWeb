import { describe, expect, it } from "vitest"
import { nativeGlassSearchEvent } from "~/lib/native-glass-search"

describe("nativeGlassSearchEvent", () => {
  const base = { id: "exchange-search", generation: 2, revision: 3 }
  it("accepts result identities and finite native geometry", () => {
    expect(
      nativeGlassSearchEvent(
        new CustomEvent("search", {
          detail: { ...base, action: "select", value: "place:1" },
        })
      )
    ).toEqual({ ...base, action: "select", value: "place:1" })
    expect(
      nativeGlassSearchEvent(
        new CustomEvent("search", {
          detail: {
            ...base,
            action: "geometry",
            frame: { x: 12, y: 100, width: 300, height: 400 },
          },
        })
      )
    ).not.toBeNull()
  })
  it.each([
    { ...base, action: "select" },
    { ...base, action: "input", value: 1 },
    { ...base, generation: -Infinity, action: "cancel" },
    { ...base, generation: -1, action: "cancel" },
    { ...base, revision: -1, action: "cancel" },
    { ...base, action: "unknown" },
    {
      ...base,
      action: "geometry",
      frame: { x: 0, y: 0, width: -1, height: 20 },
    },
  ])("rejects malformed boundary payload %j", (detail) => {
    expect(
      nativeGlassSearchEvent(new CustomEvent("search", { detail }))
    ).toBeNull()
  })
})
