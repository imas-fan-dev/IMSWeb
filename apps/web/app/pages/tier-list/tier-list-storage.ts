import { parseTierListDocument, type TierListDocument } from "./tier-list-model"

const STORAGE_KEY = "imsweb:tier-list:v1"

/**
 * localStorage keeps the builder inside the browser only. Local images are
 * stored as small compressed data URLs; wiki avatars stay plain URLs that
 * reload from the API on the next visit.
 */
export function loadTierListDocument(): TierListDocument | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    return parseTierListDocument(raw)
  } catch {
    return null
  }
}

export type SaveTierListResult = {
  saved: boolean
  reason: "quota" | "unavailable" | "ok"
}

export function saveTierListDocument(
  doc: TierListDocument
): SaveTierListResult {
  if (typeof window === "undefined") {
    return { saved: false, reason: "unavailable" }
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
    return { saved: true, reason: "ok" }
  } catch {
    return { saved: false, reason: "quota" }
  }
}

export function clearTierListDocument() {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to recover; the in-memory document is already cleared.
  }
}
