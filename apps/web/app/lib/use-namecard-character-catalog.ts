import { useEffect, useState } from "react"

import {
  getNamecardCharacterCatalog,
  type NamecardCharacterCatalog,
} from "~/lib/api"

let catalogRequest: Promise<NamecardCharacterCatalog> | null = null

/**
 * Every picker on a page wants the same catalog, so the promise itself is
 * memoized at module scope: the upload dialog, the claim dialog, and the card
 * editor share a single round trip instead of three.
 */
function requestNamecardCharacterCatalog() {
  catalogRequest ??= getNamecardCharacterCatalog()
    .send()
    .catch((error: unknown) => {
      catalogRequest = null
      throw error
    })
  return catalogRequest
}

/** Drops the shared promise so a test can exercise the failure path again. */
export function resetNamecardCharacterCatalogCache() {
  catalogRequest = null
}

export function useNamecardCharacterCatalog(enabled = true) {
  const [result, setResult] = useState<{
    catalog: NamecardCharacterCatalog | null
    failed: boolean
  } | null>(null)

  useEffect(() => {
    if (!enabled) return
    let active = true
    requestNamecardCharacterCatalog().then(
      (catalog) => {
        if (active) setResult({ catalog, failed: false })
      },
      () => {
        if (active) setResult({ catalog: null, failed: true })
      }
    )
    return () => {
      active = false
    }
  }, [enabled])

  return {
    catalog: result?.catalog ?? null,
    loading: enabled && result === null,
    failed: result?.failed ?? false,
  }
}
