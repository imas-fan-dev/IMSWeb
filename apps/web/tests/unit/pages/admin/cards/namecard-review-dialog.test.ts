import { describe, expect, it } from "vitest"

import {
  diffFields,
  diffImageSlots,
} from "~/pages/admin/cards/namecard-review-dialog"
import type { AdminNamecardDiff } from "~/lib/api"

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

describe("namecard review diff", () => {
  it("keeps every page in place when the two revisions match", () => {
    const slots = diffImageSlots(side(), side())
    expect(slots.map((slot) => slot.state)).toEqual(["same", "same"])
    expect(slots.map((slot) => slot.label)).toEqual(["正面", "背面"])
  })

  it("shows the replaced image before the new one", () => {
    const slots = diffImageSlots(
      side(),
      side({ frontImageUrl: "front-new.webp" })
    )
    expect(slots.map((slot) => [slot.state, slot.url])).toEqual([
      ["removed", "front.webp"],
      ["added", "front-new.webp"],
      ["same", "back.webp"],
    ])
  })

  it("marks an appended middle page as added", () => {
    const slots = diffImageSlots(
      side(),
      side({ middleImageUrls: ["middle-1.webp"] })
    )
    expect(slots.map((slot) => [slot.state, slot.label])).toEqual([
      ["same", "正面"],
      ["added", "中间页 1"],
      ["same", "背面"],
    ])
  })

  it("reports changed text fields and leaves the rest untouched", () => {
    const rows = diffFields(
      side(),
      side({ bio: "新简介", seriesCodes: ["765as", "cg"] })
    )
    const bio = rows.find((row) => row.label === "简介")
    expect(bio).toEqual({ label: "简介", live: "简介", pending: "新简介" })
    const series = rows.find((row) => row.label === "企划")
    expect(series?.pending).toBe("765as、cg")
    expect(rows.find((row) => row.label === "制作人名称")?.pending).toBeNull()
  })

  it("treats a cleared field as a change and renders an empty string", () => {
    const rows = diffFields(side(), side({ tradeNote: "" }))
    expect(rows.find((row) => row.label === "交换说明")).toEqual({
      label: "交换说明",
      live: "交换说明",
      pending: "",
    })
  })

  it("hides the pending side when nothing is queued", () => {
    const rows = diffFields(side(), null)
    expect(rows.every((row) => row.pending === null)).toBe(true)
  })
})
