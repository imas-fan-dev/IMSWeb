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
    displayName: card.displayName,
    seriesCode: card.seriesCode,
    favoriteCharacterIds: card.favoriteCharacters.map(
      (character) => character.id
    ),
    accent: card.accent,
    bio: card.bio,
    tradeNote: card.tradeNote,
    available: card.available,
  }
}

export function emptyCardFields(
  profile: PlatformProfile,
  series: FudabaSeries[]
): FudabaCardFields {
  return {
    producerName: profile.displayName,
    displayName: "",
    seriesCode: series[0]?.code ?? "",
    favoriteCharacterIds: [],
    accent: "#f34e6c",
    bio: profile.bio,
    tradeNote: "",
    available: true,
  }
}

export function isCardConflict(error: unknown) {
  return (
    isApiError(error) &&
    error.status === 409 &&
    error.code === "FUDABA_CARD_CONFLICT"
  )
}
