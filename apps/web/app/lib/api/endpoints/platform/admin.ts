import { adminPlatformAuthOAuthPath } from "@imsweb/contracts/paths"
import { parsed } from "../../parsed"
import { adminApiClient } from "../../admin-client"
import { withBackofficeAuth, withBackofficeCsrf } from "../../types"

import {
  platformOAuthAdminProviderListSchema,
  platformOAuthAdminProviderMutationSchema,
} from "@imsweb/contracts/platform/admin"

export {
  platformOAuthAdminProviderSchema,
  platformOAuthAdminProviderListSchema,
  platformOAuthAdminProviderMutationSchema,
} from "@imsweb/contracts/platform/admin"
export type * from "@imsweb/contracts/platform/admin"

import type { PlatformOAuthAdminProvider } from "@imsweb/contracts/platform/admin"

export function getAdminPlatformOAuthProviders() {
  return adminApiClient.Get(
    adminPlatformAuthOAuthPath("/providers"),
    parsed(platformOAuthAdminProviderListSchema, {
      meta: withBackofficeAuth(),
    })
  )
}

export function updateAdminPlatformOAuthProvider(
  provider: PlatformOAuthAdminProvider["code"],
  input: {
    displayName: string
    enabled: boolean
    clientId?: string
    clientSecret?: string
    redirectUri?: string
    expectedUpdatedAt: number
  }
) {
  return adminApiClient.Put(
    adminPlatformAuthOAuthPath(`/${provider}`),
    input,
    parsed(platformOAuthAdminProviderMutationSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}
