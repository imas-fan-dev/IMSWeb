import { describe, expect, it } from "vitest"

import { editorialCoverStyle } from "~/components/editorial/editorial-cover"

describe("editorialCoverStyle", () => {
  it("uses the editor-selected focus point for positioning and zooming", () => {
    expect(editorialCoverStyle({ focalX: 0.25, focalY: 0.75, zoom: 2 })).toEqual({
      objectPosition: "25% 75%",
      transform: "scale(2)",
      transformOrigin: "25% 75%",
    })
  })
})
