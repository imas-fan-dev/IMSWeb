import type {
  NamecardUnit,
  NamecardUnitCreateRequest,
  NamecardUnitUpdateRequest,
} from "~/lib/api"

export const NAMECARD_UNIT_CONFLICT_MESSAGE =
  "该条目已被他人修改，请刷新后重试"

/**
 * The minimum a selected-member chip renders. The page accumulates these across
 * searches so a checked member keeps its label once the candidate list is
 * filtered down to other names.
 */
export interface UnitMemberOption {
  id: number
  nameCn: string
  nameJa: string | null
  nameEn: string | null
}

/** Editable form state; `displayOrder` stays a string while the user types. */
export interface UnitDraft {
  nameCn: string
  nameJa: string
  nameEn: string
  aliases: string
  displayOrder: string
  agencyIds: number[]
  memberIds: number[]
}

export function emptyUnitDraft(): UnitDraft {
  return {
    nameCn: "",
    nameJa: "",
    nameEn: "",
    aliases: "",
    displayOrder: "0",
    agencyIds: [],
    memberIds: [],
  }
}

export function unitDraftFrom(unit: NamecardUnit): UnitDraft {
  return {
    nameCn: unit.nameCn,
    nameJa: unit.nameJa ?? "",
    nameEn: unit.nameEn ?? "",
    aliases: unit.aliases ?? "",
    displayOrder: String(unit.displayOrder),
    agencyIds: unit.agencies.map((agency) => agency.id),
    memberIds: unit.members.map((member) => member.characterId),
  }
}

export function isUnitDraftValid(draft: UnitDraft) {
  return (
    draft.nameCn.trim().length > 0 &&
    draft.agencyIds.length > 0 &&
    draft.memberIds.length > 0
  )
}

/** Empty optional text is sent as `null`, matching the wire contract. */
function orNull(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function unitFields(draft: UnitDraft) {
  const displayOrder = Number.parseInt(draft.displayOrder.trim(), 10)
  return {
    nameCn: draft.nameCn.trim(),
    nameJa: orNull(draft.nameJa),
    nameEn: orNull(draft.nameEn),
    aliases: orNull(draft.aliases),
    displayOrder:
      Number.isSafeInteger(displayOrder) && displayOrder >= 0 ? displayOrder : 0,
    agencyIds: draft.agencyIds,
    memberIds: draft.memberIds,
  }
}

export function buildUnitCreateInput(
  draft: UnitDraft
): NamecardUnitCreateRequest {
  return unitFields(draft)
}

export function buildUnitUpdateInput(
  draft: UnitDraft,
  revision: number
): NamecardUnitUpdateRequest {
  return { ...unitFields(draft), revision }
}
