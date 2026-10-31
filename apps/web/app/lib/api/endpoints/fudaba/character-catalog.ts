import { fudabaErrorResponseSchema } from "@imsweb/contracts/fudaba"
import { namecardCharacterCatalogSchema } from "@imsweb/contracts/fudaba/characters"
import { exchangePath } from "@imsweb/contracts/paths"

import { STABLE_CONTENT_CACHE_FOR } from "../../cache-policy"
import { apiClient } from "../../client"
import { parsed } from "../../parsed"

export {
  NAMECARD_FAVORITE_CHARACTER_LIMIT,
  namecardCharacterCatalogSchema,
} from "@imsweb/contracts/fudaba/characters"
export type * from "@imsweb/contracts/fudaba/characters"

/**
 * The public character catalog behind the namecard picker. The payload carries
 * the agencies, category vocabulary, characters, and units a keystroke needs,
 * so the picker filters entirely in memory. Stable enough to cache with the
 * other rarely-changing public content.
 */
export function getNamecardCharacterCatalog() {
  return apiClient.Get(
    exchangePath("/characters"),
    parsed(namecardCharacterCatalogSchema, {
      errorSchema: fudabaErrorResponseSchema,
      cacheFor: STABLE_CONTENT_CACHE_FOR,
    })
  )
}
