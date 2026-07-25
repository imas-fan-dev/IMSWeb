import { describe, expect, it } from "vitest"

import { namecardSchema } from "~/shared/api/endpoints/community"

describe("community API contracts", () => {
  it("normalizes numeric string card IDs", () => {
    expect(
      namecardSchema.parse({
        id: "12",
        image1_url: "/uploads/front.webp",
        image2_url: "/uploads/back.webp",
        status: "approved",
        created_at: null,
      }).id
    ).toBe(12)
  })

  it("rejects incomplete card media", () => {
    expect(() =>
      namecardSchema.parse({
        id: 1,
        image1_url: "/uploads/front.webp",
      })
    ).toThrow()
  })
})
