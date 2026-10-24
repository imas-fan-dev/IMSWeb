import type {
  NamecardCharacter,
  NamecardCharacterCategory,
  NamecardCharacterCreateRequest,
  NamecardCharacterUpdateRequest,
} from "~/lib/api"

export { NAMECARD_CHARACTER_CATEGORY_LABELS } from "~/lib/namecard-character-categories"

export const NAMECARD_CHARACTER_CONFLICT_MESSAGE =
  "该条目已被他人修改，请刷新后重试"

/** Editable form state; `displayOrder` stays a string while the user types. */
export interface CharacterDraft {
  agencyId: string
  category: NamecardCharacterCategory
  nameCn: string
  nameJa: string
  nameEn: string
  aliases: string
  displayOrder: string
  isFallback: boolean
}

export function emptyCharacterDraft(
  defaultAgencyId: number | null,
  defaultCategory: NamecardCharacterCategory = "idol"
): CharacterDraft {
  return {
    agencyId: defaultAgencyId === null ? "" : String(defaultAgencyId),
    category: defaultCategory,
    nameCn: "",
    nameJa: "",
    nameEn: "",
    aliases: "",
    displayOrder: "0",
    isFallback: false,
  }
}

export function characterDraftFrom(character: NamecardCharacter): CharacterDraft {
  return {
    agencyId: String(character.agencyId),
    category: character.category,
    nameCn: character.nameCn,
    nameJa: character.nameJa ?? "",
    nameEn: character.nameEn ?? "",
    aliases: character.aliases ?? "",
    displayOrder: String(character.displayOrder),
    isFallback: character.isFallback,
  }
}

export function isCharacterDraftValid(draft: CharacterDraft) {
  return draft.nameCn.trim().length > 0 && draft.agencyId !== ""
}

/** Empty optional text is sent as `null`, matching the wire contract. */
function orNull(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function characterFields(draft: CharacterDraft) {
  const displayOrder = Number.parseInt(draft.displayOrder.trim(), 10)
  return {
    agencyId: Number.parseInt(draft.agencyId, 10),
    category: draft.category,
    nameCn: draft.nameCn.trim(),
    nameJa: orNull(draft.nameJa),
    nameEn: orNull(draft.nameEn),
    aliases: orNull(draft.aliases),
    isFallback: draft.isFallback,
    displayOrder:
      Number.isSafeInteger(displayOrder) && displayOrder >= 0 ? displayOrder : 0,
  }
}

export function buildCharacterCreateInput(
  draft: CharacterDraft
): NamecardCharacterCreateRequest {
  return characterFields(draft)
}

export function buildCharacterUpdateInput(
  draft: CharacterDraft,
  revision: number
): NamecardCharacterUpdateRequest {
  return { ...characterFields(draft), revision }
}
