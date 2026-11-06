import { describe, expect, it } from "vitest"

import {
  NAMECARD_CHARACTER_CATEGORY_LABELS,
  buildCharacterCreateInput,
  buildCharacterUpdateInput,
  characterDraftFrom,
  emptyCharacterDraft,
  isCharacterDraftValid,
} from "~/pages/admin/cards/namecard-character-model"
import type { NamecardCharacter } from "~/lib/api"

const character: NamecardCharacter = {
  id: 7,
  agencyId: 2,
  agencyCode: "765as",
  agencyName: "本家",
  agencyColor: "#f34f6d",
  category: "idol",
  isFallback: false,
  nameCn: "天海春香",
  nameJa: "天海春香",
  nameEn: "Amami Haruka",
  aliases: "春香",
  displayOrder: 3,
  revision: 4,
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
}

describe("namecard character draft", () => {
  it("starts a blank draft on the default agency", () => {
    expect(emptyCharacterDraft(2)).toEqual({
      agencyId: "2",
      category: "idol",
      nameCn: "",
      nameJa: "",
      nameEn: "",
      aliases: "",
      displayOrder: "0",
      isFallback: false,
    })
    expect(emptyCharacterDraft(null).agencyId).toBe("")
  })

  it("honours the category the list is filtered by", () => {
    expect(emptyCharacterDraft(5, "rival")).toMatchObject({
      agencyId: "5",
      category: "rival",
    })
  })

  it("turns absent optional fields into empty inputs", () => {
    const draft = characterDraftFrom({
      ...character,
      nameJa: null,
      nameEn: null,
      aliases: null,
    })

    expect(draft).toEqual({
      agencyId: "2",
      category: "idol",
      nameCn: "天海春香",
      nameJa: "",
      nameEn: "",
      aliases: "",
      displayOrder: "3",
      isFallback: false,
    })
  })

  it("keeps the stored values of a populated character", () => {
    expect(characterDraftFrom(character)).toMatchObject({
      agencyId: "2",
      nameCn: "天海春香",
      nameJa: "天海春香",
      nameEn: "Amami Haruka",
      aliases: "春香",
      displayOrder: "3",
    })
  })

  it("requires a name and an agency", () => {
    expect(isCharacterDraftValid(emptyCharacterDraft(2))).toBe(false)
    expect(
      isCharacterDraftValid({ ...emptyCharacterDraft(2), nameCn: "   " })
    ).toBe(false)
    expect(
      isCharacterDraftValid({ ...emptyCharacterDraft(null), nameCn: "雪步" })
    ).toBe(false)
    expect(
      isCharacterDraftValid({ ...emptyCharacterDraft(2), nameCn: "雪步" })
    ).toBe(true)
  })

  it("trims text, maps empty optionals to null and clamps the display order", () => {
    const input = buildCharacterCreateInput({
      agencyId: "2",
      category: "rival",
      nameCn: "  其他对手  ",
      nameJa: "  ライバル ",
      nameEn: "   ",
      aliases: "",
      displayOrder: "12",
      isFallback: true,
    })

    expect(input).toEqual({
      agencyId: 2,
      category: "rival",
      nameCn: "其他对手",
      nameJa: "ライバル",
      nameEn: null,
      aliases: null,
      isFallback: true,
      displayOrder: 12,
    })
  })

  it("falls back to zero for an unusable display order", () => {
    const base = { ...emptyCharacterDraft(2), nameCn: "雪步" }

    expect(buildCharacterCreateInput({ ...base, displayOrder: "abc" }).displayOrder).toBe(0)
    expect(buildCharacterCreateInput({ ...base, displayOrder: "-4" }).displayOrder).toBe(0)
    expect(buildCharacterCreateInput({ ...base, displayOrder: "" }).displayOrder).toBe(0)
  })

  it("carries the revision on updates", () => {
    const update = buildCharacterUpdateInput(characterDraftFrom(character), 4)

    expect(update.revision).toBe(4)
    expect(update.nameCn).toBe("天海春香")
  })

  it("keeps a fallback entry flagged although the dialog hides the field", () => {
    const fallback: NamecardCharacter = {
      ...character,
      id: 1,
      category: "mascot",
      isFallback: true,
      nameCn: "其他吉祥物",
    }

    expect(
      buildCharacterUpdateInput(characterDraftFrom(fallback), 1)
    ).toMatchObject({
      isFallback: true,
      category: "mascot",
      nameCn: "其他吉祥物",
    })
  })

  it("labels every category in display order", () => {
    expect(Object.entries(NAMECARD_CHARACTER_CATEGORY_LABELS)).toEqual([
      ["idol", "偶像"],
      ["staff", "职员"],
      ["rival", "对手"],
      ["mascot", "吉祥物"],
      ["chara", "角色"],
      ["other", "其他"],
    ])
  })
})
