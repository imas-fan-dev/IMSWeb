import type {
  WikiAdminAgency,
  WikiAdminIdol,
  WikiEntryKind,
  WikiIdolSubmission,
  WikiStoryEntrySubtype,
} from "~/lib/api"

export type WikiEntryDraft = {
  name: string
  folderName: string
  wikiUrl: string
  color: string
  textColor: string
  wikiEnabled: boolean
  groupIds: number[]
  entryKind: WikiEntryKind
  entrySubtype: WikiStoryEntrySubtype | null
}

export function initialEntryDraft(
  agency?: WikiAdminAgency,
  entity?: WikiAdminIdol | null
): WikiEntryDraft {
  return {
    name: entity?.name ?? "",
    folderName: entity?.folderName ?? "",
    wikiUrl: entity?.wikiUrl ?? "",
    color: entity?.color ?? agency?.color ?? "#777777",
    textColor: entity?.textColor ?? "#ffffff",
    wikiEnabled: entity?.wikiEnabled ?? true,
    groupIds: entity?.groupIds ?? [],
    entryKind: entity?.entryKind ?? "idol",
    entrySubtype: entity?.entrySubtype ?? null,
  }
}

export function entryKindDraft(
  entryKind: WikiEntryKind,
  draft: WikiEntryDraft
) {
  return {
    entryKind,
    entrySubtype: entryKind === "story" ? (draft.entrySubtype ?? "main") : null,
  }
}

export function entryPayload(
  draft: WikiEntryDraft
): Omit<WikiIdolSubmission, "folderName"> {
  return {
    name: draft.name.trim(),
    color: draft.color || null,
    textColor: draft.textColor,
    wikiUrl: draft.wikiUrl.trim() || null,
    wikiEnabled: draft.wikiEnabled,
    groupIds: draft.groupIds,
    entryKind: draft.entryKind,
    entrySubtype: draft.entrySubtype,
  }
}
