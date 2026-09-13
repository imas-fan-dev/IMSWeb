import {
  adminPlatformEmailConfigurationTestRequestSchema,
  adminPlatformEmailConfigurationWriteRequestSchema,
  adminPlatformEmailHttpErrorSchema,
  adminPlatformEmailMutationResponseSchema,
  adminPlatformEmailSettingsResponseSchema,
  adminPlatformEmailTestResponseSchema,
  type AdminPlatformEmailConfigurationTestRequest,
  type AdminPlatformEmailConfigurationWriteRequest,
} from "@imsweb/contracts/platform/admin-email"
import { adminApiPath } from "@imsweb/contracts/paths"

import { adminApiClient } from "../../admin-client"
import { parsed } from "../../parsed"
import { withBackofficeAuth, withBackofficeCsrf } from "../../types"

const ADMIN_PLATFORM_EMAIL_PATH = adminApiPath("/platform/email")

export type AdminPlatformEmailConfigurationInput =
  AdminPlatformEmailConfigurationWriteRequest
export type AdminPlatformEmailConfigurationTestInput =
  AdminPlatformEmailConfigurationTestRequest

export function getAdminPlatformEmailSettings() {
  return adminApiClient.Get(
    ADMIN_PLATFORM_EMAIL_PATH,
    parsed(adminPlatformEmailSettingsResponseSchema, {
      errorSchema: adminPlatformEmailHttpErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}

export function updateAdminPlatformEmailSettings(
  input: AdminPlatformEmailConfigurationInput
) {
  const submission =
    adminPlatformEmailConfigurationWriteRequestSchema.parse(input)
  return adminApiClient.Put(
    ADMIN_PLATFORM_EMAIL_PATH,
    submission,
    parsed(adminPlatformEmailMutationResponseSchema, {
      errorSchema: adminPlatformEmailHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function testAdminPlatformEmailSettings(
  input: AdminPlatformEmailConfigurationTestInput
) {
  const submission =
    adminPlatformEmailConfigurationTestRequestSchema.parse(input)
  return adminApiClient.Post(
    `${ADMIN_PLATFORM_EMAIL_PATH}/test`,
    submission,
    parsed(adminPlatformEmailTestResponseSchema, {
      errorSchema: adminPlatformEmailHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export {
  adminPlatformEmailConfigurationTestRequestSchema,
  adminPlatformEmailConfigurationWriteRequestSchema,
  adminPlatformEmailSecuritySchema,
  adminPlatformEmailSettingsSchema,
} from "@imsweb/contracts/platform/admin-email"
export type * from "@imsweb/contracts/platform/admin-email"
