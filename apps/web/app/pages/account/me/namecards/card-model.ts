import { emptyCredit } from "./card-credits-editor"
import {
  NAMECARD_OWNER_STATUS_LABELS,
} from "~/components/community/namecard-status-labels"
import {
  isApiError,
  type FudabaCardFields,
  type FudabaOwnerCard,
  type PlatformProfile,
} from "~/lib/api"

export type EditorFeedback = {
  kind: "success" | "error" | "conflict"
  message: string
}

export const publicationLabels: Record<
  FudabaOwnerCard["publicationStatus"],
  string
> = NAMECARD_OWNER_STATUS_LABELS

/**
 * A published card keeps serving its approved copy while the submitted revision
 * waits in `pendingContent`, so the editor has to seed from that revision —
 * otherwise a just-saved edit snaps back to the live values.
 */
export function cardFields(card: FudabaOwnerCard): FudabaCardFields {
  const pending = card.pendingContent
  const content = pending ?? card
  return {
    producerName: content.producerName,
    producerReading: content.producerReading,
    seriesCodes: content.seriesCodes,
    favoriteCharacterIds: pending
      ? pending.favoriteCharacterIds
      : card.favoriteCharacters.map((character) => character.id),
    bio: content.bio,
    tradeNote: content.tradeNote,
    exchangeMode: content.exchangeMode,
    madeOn: content.madeOn,
    groupName: content.groupName,
    isGroupCard: content.isGroupCard ?? false,
    isOriginal: content.isOriginal,
    madeWithAi: content.madeWithAi,
    visible: content.visible,
    credits: content.credits.length ? content.credits : [emptyCredit()],
    // 标签即时生效，不随待审版本变化：无论读 live 还是 pending 内容，都取根上的 tags。
    tags: (card.tags ?? []).map((tag) => tag.name),
  }
}

export function emptyCardFields(profile: PlatformProfile): FudabaCardFields {
  return {
    producerName: profile.displayName,
    producerReading: null,
    isGroupCard: false,
    // Nothing is ticked up front: a new card may belong to several series, and
    // pre-selecting the first one published a choice the author never made.
    seriesCodes: [],
    favoriteCharacterIds: [],
    bio: profile.bio,
    tradeNote: "",
    exchangeMode: "auto",
    madeOn: null,
    groupName: null,
    isOriginal: false,
    madeWithAi: false,
    visible: true,
    credits: [emptyCredit()],
    tags: [],
  }
}

export function isCardConflict(error: unknown) {
  return (
    isApiError(error) &&
    error.status === 409 &&
    error.code === "FUDABA_CARD_CONFLICT"
  )
}
