import { useEffect, useState } from "react"

import {
  getNamecardCharacterCatalog,
  type NamecardCharacterCatalog,
} from "~/lib/api"

let catalogRequest: Promise<NamecardCharacterCatalog> | null = null

/**
 * Every picker on a page wants the same catalog, so the promise itself is
 * shared while in flight: the upload dialog, the claim dialog, and the card
 * editor share a single round trip. Completed content uses the API client's
 * expiring cache instead of a permanent module promise.
 */
function requestNamecardCharacterCatalog() {
  if (catalogRequest) return catalogRequest
  const request: Promise<NamecardCharacterCatalog> =
    getNamecardCharacterCatalog()
      .send()
      .finally(() => {
        if (catalogRequest === request) catalogRequest = null
      })
  catalogRequest = request
  return catalogRequest
}

/** Reset after a catalog mutation, or before exercising a new test scenario. */
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
