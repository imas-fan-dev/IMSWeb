import { describe, expect, it } from "vitest"

import {
  adminMediaOrder,
  fieldsFromSide,
  manageChangeNeedsReason,
  slotsFromSide,
} from "~/pages/admin/cards/namecard-manage-dialog"
import type { AdminNamecardDiff, FudabaCardFields } from "~/lib/api"

type DiffSide = AdminNamecardDiff["live"]

function side(overrides: Partial<DiffSide> = {}): DiffSide {
  return {
    producerName: "ZheiZhei",
    producerReading: "ぜいぜい",
    groupName: null,
    madeOn: "2025-10-07",
    bio: "简介",
    tradeNote: "交换说明",
    isOriginal: true,
    madeWithAi: false,
    visible: true,
    exchangeMode: "manual",
    seriesCodes: ["765as"],
    credits: [
      { accountId: null, displayName: "甲", url: null, roles: ["design"] },
    ],
    favoriteCharacters: [{ id: 1, name: "天海春香", seriesCode: "765as" }],
    frontImageUrl: "front.webp",
    backImageUrl: "back.webp",
    middleImageUrls: [],
    ...overrides,
  }
}

function fields(overrides: Partial<FudabaCardFields> = {}): FudabaCardFields {
  return { ...fieldsFromSide(side()), ...overrides }
}

function gate(overrides: Partial<Parameters<typeof manageChangeNeedsReason>[0]> = {}) {
  return manageChangeNeedsReason({
    draft: fields(),
    original: fields(),
    status: "published",
    publicationStatus: "published",
    reviewStatus: "none",
    storedReviewStatus: null,
    ownerTouched: false,
    ...overrides,
  })
}

describe("namecard management window", () => {
  it("keeps the stored page order when nothing moved", () => {
    expect(
      slotsFromSide(side()).map((slot) =>
        slot.kind === "existing" ? slot.index : -1
      )
    ).toEqual([0, 1])
    expect(adminMediaOrder(slotsFromSide(side()))).toEqual(["#0", "#1"])
  })

  it("writes the reordered slots as the new page order", () => {
    const slots = slotsFromSide(side({ middleImageUrls: ["middle-1.webp"] }))
    const reordered = [slots[2]!, slots[0]!, slots[1]!]
    expect(adminMediaOrder(reordered)).toEqual(["#2", "#0", "#1"])
  })

  it("asks for no reason when nothing at all changed", () => {
    expect(gate()).toBe(false)
  })

  it("asks for a reason for content, status, version and owner changes", () => {
    expect(gate({ draft: fields({ bio: "新简介" }) })).toBe(true)
    expect(gate({ status: "locked" })).toBe(true)
    expect(gate({ reviewStatus: "rejected" })).toBe(true)
    expect(gate({ ownerTouched: true })).toBe(true)
  })

  it("treats a stored queue entry as unchanged until it is edited", () => {
    expect(gate({ storedReviewStatus: "pending", reviewStatus: "pending" })).toBe(
      false
    )
    expect(
      gate({ storedReviewStatus: "pending", reviewStatus: "none" })
    ).toBe(true)
  })

  it("keeps the reading, group and credits the row carries", () => {
    const stored = fieldsFromSide(
      side({ groupName: "本家", favoriteCharacters: [] })
    )
    expect(stored.producerReading).toBe("ぜいぜい")
    expect(stored.groupName).toBe("本家")
    expect(stored.favoriteCharacterIds).toEqual([])
    expect(stored.credits).toHaveLength(1)
  })
})
