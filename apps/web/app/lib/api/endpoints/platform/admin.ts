import { adminPlatformAuthOAuthPath } from "@imsweb/contracts/paths"
import {
  platformOAuthAdminHttpErrorSchema,
  platformOAuthAdminProviderDeleteSchema,
  platformOAuthAdminProviderListSchema,
  platformOAuthAdminProviderMutationSchema,
  platformOAuthProviderCreateRequestSchema,
  platformOAuthProviderDeleteRequestSchema,
  platformOAuthAdminProviderParamsSchema,
  platformOAuthProviderUpdateRequestSchema,
  type PlatformOAuthAdminProvider,
  type PlatformOAuthProviderCreateRequest,
  type PlatformOAuthProviderUpdateRequest,
  type PlatformOAuthProviderWriteRequest,
} from "@imsweb/contracts/platform/admin"

import { adminApiClient } from "../../admin-client"
import { parsed } from "../../parsed"
import { withBackofficeAuth, withBackofficeCsrf } from "../../types"

export {
  platformOAuthProfilePathSchema,
  platformOAuthAdminProviderSchema,
  platformOAuthAdminProviderListSchema,
  platformOAuthAdminProviderMutationSchema,
  platformOAuthAdminProviderDeleteSchema,
} from "@imsweb/contracts/platform/admin"
export type * from "@imsweb/contracts/platform/admin"

export type PlatformOAuthProviderWriteInput = PlatformOAuthProviderWriteRequest
export type PlatformOAuthProviderCreateInput =
  PlatformOAuthProviderCreateRequest
export type PlatformOAuthProviderUpdateInput =
  PlatformOAuthProviderUpdateRequest

export function getAdminPlatformOAuthProviders() {
  return adminApiClient.Get(
    adminPlatformAuthOAuthPath("/providers"),
    parsed(platformOAuthAdminProviderListSchema, {
      errorSchema: platformOAuthAdminHttpErrorSchema,
      meta: withBackofficeAuth(),
    })
  )
}

export function createAdminPlatformOAuthProvider(
  input: PlatformOAuthProviderCreateInput
) {
  const submission = platformOAuthProviderCreateRequestSchema.parse(input)
  return adminApiClient.Post(
    adminPlatformAuthOAuthPath("/providers"),
    submission,
    parsed(platformOAuthAdminProviderMutationSchema, {
      errorSchema: platformOAuthAdminHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function updateAdminPlatformOAuthProvider(
  provider: PlatformOAuthAdminProvider["code"],
  input: PlatformOAuthProviderUpdateInput
) {
  const code =
    platformOAuthAdminProviderParamsSchema.shape.provider.parse(provider)
  const submission = platformOAuthProviderUpdateRequestSchema.parse(input)
  return adminApiClient.Put(
    adminPlatformAuthOAuthPath(`/${encodeURIComponent(code)}`),
    submission,
    parsed(platformOAuthAdminProviderMutationSchema, {
      errorSchema: platformOAuthAdminHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}

export function deleteAdminPlatformOAuthProvider(
  provider: PlatformOAuthAdminProvider["code"],
  expectedUpdatedAt: number
) {
  const code =
    platformOAuthAdminProviderParamsSchema.shape.provider.parse(provider)
  const submission = platformOAuthProviderDeleteRequestSchema.parse({
    expectedUpdatedAt,
  })
  return adminApiClient.Delete(
    adminPlatformAuthOAuthPath(`/${encodeURIComponent(code)}`),
    submission,
    parsed(platformOAuthAdminProviderDeleteSchema, {
      errorSchema: platformOAuthAdminHttpErrorSchema,
      meta: withBackofficeCsrf(),
    })
  )
}
