import {
  namecardCharacterAdminHttpErrorResponseSchema,
  namecardCharacterAgencyListSchema,
  namecardCharacterDeleteSchema,
  namecardCharacterListSchema,
  namecardCharacterMutationSchema,
  type NamecardCharacterCategory,
  type NamecardCharacterCreateRequest,
  type NamecardCharacterUpdateRequest,
} from "@imsweb/contracts/fudaba/admin-characters"
import { adminApiPath } from "@imsweb/contracts/paths"

import { adminApiClient } from "../../admin-client"
import { parsed } from "../../parsed"
import { withBackofficeAuth, withBackofficeCsrf } from "../../types"

export {
  NAMECARD_CHARACTER_CATEGORIES,
  NAMECARD_CHARACTER_DEFAULT_PAGE_SIZE,
  NAMECARD_CHARACTER_MAX_PAGE_SIZE,
  NAMECARD_CHARACTER_MAX_QUERY_LENGTH,
  namecardCharacterSchema,
} from "@imsweb/contracts/fudaba/admin-characters"
export type * from "@imsweb/contracts/fudaba/admin-characters"

const ADMIN_CHARACTERS_PATH = adminApiPath("/cards/characters")

export interface AdminNamecardCharacterSearchInput {
  query?: string
  agencyId?: number
  category?: NamecardCharacterCategory
  page?: number
  pageSize?: number
}

export type AdminNamecardCharacterCreateInput = NamecardCharacterCreateRequest
export type AdminNamecardCharacterUpdateInput = NamecardCharacterUpdateRequest

/** Query keys are only sent when they carry a value, so the strict query
 * contract never sees an empty `query=` that fails `min(1)`. */
function searchParams(input: AdminNamecardCharacterSearchInput) {
  const params: Record<string, string> = {}
  if (input.query) params.query = input.query
  if (input.agencyId !== undefined) params.agencyId = String(input.agencyId)
  if (input.category) params.category = input.category
  if (input.page !== undefined) params.page = String(input.page)
  if (input.pageSize !== undefined) params.pageSize = String(input.pageSize)
  return params
}

export function getAdminNamecardCharacters(
  input: AdminNamecardCharacterSearchInput = {}
) {
  return adminApiClient.Get(
    ADMIN_CHARACTERS_PATH,
    parsed(namecardCharacterListSchema, {
      errorSchema: namecardCharacterAdminHttpErrorResponseSchema,
      meta: withBackofficeAuth(),
      params: searchParams(input),
    })
  )
}

export function getAdminNamecardCharacterAgencies() {
  return adminApiClient.Get(
    `${ADMIN_CHARACTERS_PATH}/agencies`,
    parsed(namecardCharacterAgencyListSchema, {
      errorSchema: namecardCharacterAdminHttpErrorResponseSchema,
      meta: withBackofficeAuth(),
    })
  )
}

export function createAdminNamecardCharacter(
  input: AdminNamecardCharacterCreateInput
) {
  return adminApiClient.Post(
    ADMIN_CHARACTERS_PATH,
    input,
    parsed(namecardCharacterMutationSchema, {
      errorSchema: namecardCharacterAdminHttpErrorResponseSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function updateAdminNamecardCharacter(
  id: number,
  input: AdminNamecardCharacterUpdateInput
) {
  return adminApiClient.Patch(
    `${ADMIN_CHARACTERS_PATH}/${id}`,
    input,
    parsed(namecardCharacterMutationSchema, {
      errorSchema: namecardCharacterAdminHttpErrorResponseSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function deleteAdminNamecardCharacter(id: number, revision: number) {
  return adminApiClient.Delete(
    `${ADMIN_CHARACTERS_PATH}/${id}`,
    undefined,
    parsed(namecardCharacterDeleteSchema, {
      errorSchema: namecardCharacterAdminHttpErrorResponseSchema,
      meta: withBackofficeCsrf(),
      params: { revision: String(revision) },
    })
  )
}
