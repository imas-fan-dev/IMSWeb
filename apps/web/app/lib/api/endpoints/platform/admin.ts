import { parsed } from "../../parsed"
import { adminApiClient } from "../../admin-client"
import { withBackofficeAuth, withBackofficeCsrf } from "../../types"

import {
  platformOAuthAdminProviderListSchema,
  platformOAuthAdminProviderMutationSchema,
} from "@imsweb/contracts/platform/admin"

export * from "@imsweb/contracts/platform/admin"

import type { PlatformOAuthAdminProvider } from "@imsweb/contracts/platform/admin"

export function getAdminPlatformOAuthProviders() {
  return adminApiClient.Get(
    "/api/admin/platform/auth/oauth/providers",
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
    `/api/admin/platform/auth/oauth/${provider}`,
    input,
    parsed(platformOAuthAdminProviderMutationSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}
