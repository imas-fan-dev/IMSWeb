import { exchangePath } from "@imsweb/contracts/paths"

import { API_ORIGIN } from "../../origin"
import {
  getCredentialedMedia,
  mediaPathValidator,
  requiresCredentialedMedia,
} from "./media-credentials"

/** Only these API-owned routes may receive platform credentials. */
export const ownerCardMediaPath = mediaPathValidator(
  exchangePath("me/cards/")
)

export function getOwnerCardMedia(source: string) {
  const path = ownerCardMediaPath(source, API_ORIGIN)
  if (!path) throw new Error("Invalid owner card media URL")
  return getCredentialedMedia(path)
}

export function ownerCardMediaRequiresAuth(source: string | null): boolean {
  return requiresCredentialedMedia(source, (value) =>
    ownerCardMediaPath(value, API_ORIGIN)
  )
}
