import { emptyCredit } from "./card-credits-editor"
import {
  isApiError,
  type FudabaCardFields,
  type FudabaOwnerCard,
  type FudabaSeries,
  type PlatformProfile,
} from "~/lib/api"

export type EditorFeedback = {
  kind: "success" | "error" | "conflict"
  message: string
}

export const publicationLabels: Record<
  FudabaOwnerCard["publicationStatus"],
  string
> = {
  draft: "草稿",
  pending: "审核中",
  approving: "发布处理中",
  published: "已公开",
  hidden: "已隐藏",
  rejected: "已驳回",
  withdrawn: "已撤回",
  locked: "已锁定",
}

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
    isOriginal: content.isOriginal,
    madeWithAi: content.madeWithAi,
    visible: content.visible,
    credits: content.credits.length ? content.credits : [emptyCredit()],
  }
}

export function emptyCardFields(
  profile: PlatformProfile,
  series: FudabaSeries[]
): FudabaCardFields {
  return {
    producerName: profile.displayName,
    producerReading: null,
    // A new card starts on the first published series; the editor lets the
    // author move it or add more.
    seriesCodes: series[0] ? [series[0].code] : [],
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
  }
}

export function isCardConflict(error: unknown) {
  return (
    isApiError(error) &&
    error.status === 409 &&
    error.code === "FUDABA_CARD_CONFLICT"
  )
}
