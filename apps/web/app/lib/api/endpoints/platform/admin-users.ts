import {
  adminPlatformUserDetailResponseSchema,
  adminPlatformUserHttpErrorSchema,
  adminPlatformUserListSchema,
  adminPlatformUserOAuthUnlinkResponseSchema,
  adminPlatformUserPasswordResetResponseSchema,
  adminPlatformUserSessionRevocationResponseSchema,
  adminPlatformUserStatusRequestSchema,
  adminPlatformUserStatusResponseSchema,
  type AdminPlatformUserStatusRequest,
} from "@imsweb/contracts/platform/admin-users"
import { adminApiPath } from "@imsweb/contracts/paths"

import { adminApiClient } from "../../admin-client"
import { parsed } from "../../parsed"
import { withBackofficeAuth, withBackofficeCsrf } from "../../types"

const ADMIN_PLATFORM_USERS_PATH = adminApiPath("/platform/users")

export type AdminPlatformUserSearchField = "id" | "email" | "display_name"

export interface AdminPlatformUserSearchInput {
  query?: string
  field?: AdminPlatformUserSearchField
  page?: number
  pageSize?: number
}

export type AdminPlatformUserStatusInput = AdminPlatformUserStatusRequest

function userPath(id: string) {
  return `${ADMIN_PLATFORM_USERS_PATH}/${encodeURIComponent(id)}`
}

/** Query keys are only sent when they carry a value, so the strict query
 * contract never sees an empty `query=` that fails `min(1)`. */
function searchParams(input: AdminPlatformUserSearchInput) {
  const params: Record<string, string> = {}
  if (input.query) params.query = input.query
  if (input.field) params.field = input.field
  if (input.page !== undefined) params.page = String(input.page)
  if (input.pageSize !== undefined) params.pageSize = String(input.pageSize)
  return params
}

export function getAdminPlatformUsers(
  input: AdminPlatformUserSearchInput = {}
) {
  return adminApiClient.Get(
    ADMIN_PLATFORM_USERS_PATH,
    parsed(adminPlatformUserListSchema, {
      errorSchema: adminPlatformUserHttpErrorSchema,
      meta: withBackofficeAuth(),
      params: searchParams(input),
    })
  )
}

export function getAdminPlatformUser(id: string) {
  return adminApiClient.Get(
    userPath(id),
    parsed(adminPlatformUserDetailResponseSchema, {
      errorSchema: adminPlatformUserHttpErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}

export function updateAdminPlatformUserStatus(
  id: string,
  input: AdminPlatformUserStatusInput
) {
  const submission = adminPlatformUserStatusRequestSchema.parse(input)
  return adminApiClient.Put(
    `${userPath(id)}/status`,
    submission,
    parsed(adminPlatformUserStatusResponseSchema, {
      errorSchema: adminPlatformUserHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function revokeAdminPlatformUserSessions(id: string) {
  return adminApiClient.Delete(
    `${userPath(id)}/sessions`,
    undefined,
    parsed(adminPlatformUserSessionRevocationResponseSchema, {
      errorSchema: adminPlatformUserHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function triggerAdminPlatformUserPasswordReset(id: string) {
  return adminApiClient.Post(
    `${userPath(id)}/password-reset`,
    undefined,
    parsed(adminPlatformUserPasswordResetResponseSchema, {
      errorSchema: adminPlatformUserHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function unlinkAdminPlatformUserOAuth(id: string, provider: string) {
  return adminApiClient.Delete(
    `${userPath(id)}/oauth-links/${encodeURIComponent(provider)}`,
    undefined,
    parsed(adminPlatformUserOAuthUnlinkResponseSchema, {
      errorSchema: adminPlatformUserHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export {
  adminPlatformUserSchema,
  adminPlatformUserListSchema,
  adminPlatformUserDetailSchema,
} from "@imsweb/contracts/platform/admin-users"
export type * from "@imsweb/contracts/platform/admin-users"
