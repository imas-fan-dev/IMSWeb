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

export function cardFields(card: FudabaOwnerCard): FudabaCardFields {
  return {
    producerName: card.producerName,
    producerReading: card.producerReading,
    seriesCodes: card.seriesCodes,
    favoriteCharacterIds: card.favoriteCharacters.map(
      (character) => character.id
    ),
    bio: card.bio,
    tradeNote: card.tradeNote,
    exchangeMode: card.exchangeMode,
    madeOn: card.madeOn,
    groupName: card.groupName,
    isOriginal: card.isOriginal,
    madeWithAi: card.madeWithAi,
    visible: card.visible,
    credits: card.credits,
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
    exchangeMode: "manual",
    madeOn: null,
    groupName: null,
    isOriginal: false,
    madeWithAi: false,
    visible: true,
    credits: [],
  }
}

export function isCardConflict(error: unknown) {
  return (
    isApiError(error) &&
    error.status === 409 &&
    error.code === "FUDABA_CARD_CONFLICT"
  )
}
