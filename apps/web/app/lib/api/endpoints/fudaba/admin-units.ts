import {
  namecardUnitAdminHttpErrorResponseSchema,
  namecardUnitDeleteSchema,
  namecardUnitListSchema,
  namecardUnitMutationSchema,
  type NamecardUnitCreateRequest,
  type NamecardUnitUpdateRequest,
} from "@imsweb/contracts/fudaba/admin-units"
import { adminApiPath } from "@imsweb/contracts/paths"

import { adminApiClient } from "../../admin-client"
import { parsed } from "../../parsed"
import { withBackofficeAuth, withBackofficeCsrf } from "../../types"

export {
  NAMECARD_UNIT_DEFAULT_PAGE_SIZE,
  NAMECARD_UNIT_MAX_AGENCIES,
  NAMECARD_UNIT_MAX_MEMBERS,
  NAMECARD_UNIT_MAX_PAGE_SIZE,
  NAMECARD_UNIT_MAX_QUERY_LENGTH,
  namecardUnitSchema,
} from "@imsweb/contracts/fudaba/admin-units"
export type * from "@imsweb/contracts/fudaba/admin-units"

const ADMIN_UNITS_PATH = adminApiPath("/cards/units")

export interface AdminNamecardUnitSearchInput {
  query?: string
  agencyId?: number
  page?: number
  pageSize?: number
  /** Units that contain every one of these characters. */
  memberIds?: number[]
}

export type AdminNamecardUnitCreateInput = NamecardUnitCreateRequest
export type AdminNamecardUnitUpdateInput = NamecardUnitUpdateRequest

/** Query keys are only sent when they carry a value, so the strict query
 * contract never sees an empty `query=` that fails `min(1)`. */
function searchParams(input: AdminNamecardUnitSearchInput) {
  const params: Record<string, string> = {}
  if (input.query) params.query = input.query
  if (input.memberIds && input.memberIds.length > 0)
    params.memberIds = input.memberIds.join(",")
  if (input.agencyId !== undefined) params.agencyId = String(input.agencyId)
  if (input.page !== undefined) params.page = String(input.page)
  if (input.pageSize !== undefined) params.pageSize = String(input.pageSize)
  return params
}

export function getAdminNamecardUnits(
  input: AdminNamecardUnitSearchInput = {}
) {
  return adminApiClient.Get(
    ADMIN_UNITS_PATH,
    parsed(namecardUnitListSchema, {
      errorSchema: namecardUnitAdminHttpErrorResponseSchema,
      meta: withBackofficeAuth(),
      params: searchParams(input),
    })
  )
}

export function createAdminNamecardUnit(input: AdminNamecardUnitCreateInput) {
  return adminApiClient.Post(
    ADMIN_UNITS_PATH,
    input,
    parsed(namecardUnitMutationSchema, {
      errorSchema: namecardUnitAdminHttpErrorResponseSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function updateAdminNamecardUnit(
  id: number,
  input: AdminNamecardUnitUpdateInput
) {
  return adminApiClient.Patch(
    `${ADMIN_UNITS_PATH}/${id}`,
    input,
    parsed(namecardUnitMutationSchema, {
      errorSchema: namecardUnitAdminHttpErrorResponseSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function deleteAdminNamecardUnit(id: number, revision: number) {
  return adminApiClient.Delete(
    `${ADMIN_UNITS_PATH}/${id}`,
    undefined,
    parsed(namecardUnitDeleteSchema, {
      errorSchema: namecardUnitAdminHttpErrorResponseSchema,
      meta: withBackofficeCsrf(),
      params: { revision: String(revision) },
    })
  )
}
