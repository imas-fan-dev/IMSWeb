import { describe, expect, it } from "vitest"

import {
  buildUnitCreateInput,
  buildUnitUpdateInput,
  emptyUnitDraft,
  isUnitDraftValid,
  unitDraftFrom,
} from "~/pages/admin/cards/namecard-unit-model"
import type { NamecardUnit } from "~/lib/api"

const unit: NamecardUnit = {
  id: 9,
  nameCn: "Project Fairy",
  nameJa: "プロジェクト・フェアリー",
  nameEn: null,
  aliases: "妖精",
  displayOrder: 5,
  revision: 2,
  agencies: [{ id: 2, code: "765as", name: "本家", color: "#f34f6d" }],
  members: [
    {
      characterId: 30,
      nameCn: "星井美希",
      nameJa: null,
      nameEn: null,
      category: "idol",
    },
    {
      characterId: 31,
      nameCn: "我那霸响",
      nameJa: null,
      nameEn: "Ganaha Hibiki",
      category: "idol",
    },
  ],
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
}

describe("namecard unit draft", () => {
  it("starts an empty draft with no agencies or members", () => {
    expect(emptyUnitDraft()).toEqual({
      nameCn: "",
      nameJa: "",
      nameEn: "",
      aliases: "",
      displayOrder: "0",
      agencyIds: [],
      memberIds: [],
    })
  })

  it("projects the stored relations into the draft", () => {
    expect(unitDraftFrom(unit)).toEqual({
      nameCn: "Project Fairy",
      nameJa: "プロジェクト・フェアリー",
      nameEn: "",
      aliases: "妖精",
      displayOrder: "5",
      agencyIds: [2],
      memberIds: [30, 31],
    })
  })

  it("requires a name, an agency and at least one member", () => {
    const complete = { ...emptyUnitDraft(), nameCn: "Fairy", agencyIds: [2], memberIds: [30] }

    expect(isUnitDraftValid(complete)).toBe(true)
    expect(isUnitDraftValid({ ...complete, nameCn: "   " })).toBe(false)
    expect(isUnitDraftValid({ ...complete, agencyIds: [] })).toBe(false)
    expect(isUnitDraftValid({ ...complete, memberIds: [] })).toBe(false)
  })

  it("trims text, maps empty optionals to null and clamps the display order", () => {
    const input = buildUnitCreateInput({
      nameCn: "  Project Fairy  ",
      nameJa: " ",
      nameEn: "  Project Fairy ",
      aliases: "",
      displayOrder: "7",
      agencyIds: [2, 6],
      memberIds: [30, 31],
    })

    expect(input).toEqual({
      nameCn: "Project Fairy",
      nameJa: null,
      nameEn: "Project Fairy",
      aliases: null,
      displayOrder: 7,
      agencyIds: [2, 6],
      memberIds: [30, 31],
    })
  })

  it("falls back to zero for an unusable display order", () => {
    const base = { ...emptyUnitDraft(), nameCn: "Fairy", agencyIds: [2], memberIds: [30] }

    expect(buildUnitCreateInput({ ...base, displayOrder: "x" }).displayOrder).toBe(0)
    expect(buildUnitCreateInput({ ...base, displayOrder: "-1" }).displayOrder).toBe(0)
  })

  it("carries the revision on updates", () => {
    const update = buildUnitUpdateInput(unitDraftFrom(unit), 2)

    expect(update.revision).toBe(2)
    expect(update.nameCn).toBe("Project Fairy")
    expect(update.memberIds).toEqual([30, 31])
  })
})
