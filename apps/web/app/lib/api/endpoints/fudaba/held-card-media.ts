import { exchangePath } from "@imsweb/contracts/paths"

import { API_ORIGIN } from "../../origin"
import {
  getCredentialedMedia,
  mediaPathValidator,
  requiresCredentialedMedia,
} from "./media-credentials"

/**
 * 交换墙的媒体地址。原卡对所有人可读时匿名也能取；属主上线/下线（`hidden`）后
 * 只剩「名片册里已有这张卡的人」凭平台身份可读（`serve-public-card-media.ts`）。
 * 名片册对未公开的条目因此要显式要求凭据，否则 App（无 cookie）拿不到图。
 */
export const heldCardMediaPath = mediaPathValidator(exchangePath("cards/"))

export function getHeldCardMedia(source: string) {
  const path = heldCardMediaPath(source, API_ORIGIN)
  if (!path) throw new Error("Invalid held card media URL")
  return getCredentialedMedia(path)
}

export function heldCardMediaRequiresAuth(source: string | null): boolean {
  return requiresCredentialedMedia(source, (value) =>
    heldCardMediaPath(value, API_ORIGIN)
  )
}
