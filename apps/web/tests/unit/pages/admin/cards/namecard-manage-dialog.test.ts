import { describe, expect, it } from "vitest"

import {
  adminMediaOrder,
  adminRotationPayload,
  fieldsFromSide,
  manageChangeNeedsReason,
  slotsFromSide,
} from "~/pages/admin/cards/namecard-manage-dialog"
import type { AdminNamecardDiff, FudabaCardFields } from "~/lib/api"

type DiffSide = AdminNamecardDiff["live"]

function sidePage(
  pageId: string,
  order: number,
  role: "front" | "middle" | "back",
  url: string
) {
  return {
    pageId,
    role,
    order,
    url,
    previewUrl: url,
    thumbUrl: url,
    width: 900,
    height: 500,
  }
}

function side(overrides: Partial<DiffSide> = {}): DiffSide {
  return {
    producerName: "ZheiZhei",
    producerReading: "ぜいぜい",
    groupName: null,
    isGroupCard: false,
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
    pages: [
      sidePage("front", 1, "front", "front.webp"),
      sidePage("back", 2, "back", "back.webp"),
    ],
    ...overrides,
  }
}

function fields(overrides: Partial<FudabaCardFields> = {}): FudabaCardFields {
  return { ...fieldsFromSide(side()), ...overrides }
}

function gate(
  overrides: Partial<Parameters<typeof manageChangeNeedsReason>[0]> = {}
) {
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
    const slots = slotsFromSide(
      side({
        pages: [
          sidePage("front", 1, "front", "front.webp"),
          sidePage("middle-1", 2, "middle", "middle-1.webp"),
          sidePage("back", 3, "back", "back.webp"),
        ],
      })
    )
    const reordered = [slots[2]!, slots[0]!, slots[1]!]
    expect(adminMediaOrder(reordered)).toEqual(["#2", "#0", "#1"])
  })

  it("asks for no reason when nothing at all changed", () => {
    expect(gate()).toBe(false)
  })

  it("requires a reason for content, owner and most status changes", () => {
    expect(gate({ draft: fields({ bio: "新简介" }) })).toBe(true)
    expect(gate({ status: "locked" })).toBe(true)
    expect(gate({ reviewStatus: "rejected" })).toBe(true)
    expect(gate({ ownerTouched: true })).toBe(true)
  })

  it("exempts only hidden-to-locked and pending-to-approved", () => {
    expect(gate({ publicationStatus: "hidden", status: "locked" })).toBe(false)
    expect(
      gate({ storedReviewStatus: "pending", reviewStatus: "approved" })
    ).toBe(false)
    expect(gate({ publicationStatus: "pending", status: "published" })).toBe(
      false
    )
  })

  it("asks for a reason when artwork or rotation changes", () => {
    expect(gate({ artworkChanged: true })).toBe(true)
    expect(gate({ rotationChanged: true })).toBe(true)
  })

  it("treats an unchanged stored queue entry as no change", () => {
    expect(
      gate({ storedReviewStatus: "pending", reviewStatus: "pending" })
    ).toBe(false)
    expect(gate({ storedReviewStatus: "pending", reviewStatus: "none" })).toBe(
      true
    )
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

describe("admin rotation payload", () => {
  it("maps front and back turns", () => {
    expect(adminRotationPayload(4, { 0: 1, 3: 2 })).toEqual({
      front: 1,
      back: 2,
    })
  })

  it("keeps middle indices aligned and drops trailing zeros", () => {
    expect(adminRotationPayload(4, { 1: 1 })).toEqual({ middles: [1] })
    expect(adminRotationPayload(5, { 2: 3 })).toEqual({ middles: [0, 3] })
  })

  it("ignores rotations on single and double sided cards that have no middles", () => {
    expect(adminRotationPayload(1, { 0: 1 })).toEqual({ front: 1 })
    expect(adminRotationPayload(2, {})).toBeUndefined()
  })
})
