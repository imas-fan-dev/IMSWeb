import { z } from "@imsweb/contracts/z"

import { adminApiClient } from "../../admin-client"
import { withBackofficeAuth, withBackofficeCsrf } from "../../types"

import {
  platformOAuthAdminProviderListSchema,
  platformOAuthAdminProviderMutationSchema,
} from "@imsweb/contracts/platform/admin"

export * from "@imsweb/contracts/platform/admin"

import type {
  PlatformOAuthAdminProvider,
  PlatformOAuthAdminProviderList,
} from "@imsweb/contracts/platform/admin"

export function getAdminPlatformOAuthProviders() {
  return adminApiClient.Get<PlatformOAuthAdminProviderList, unknown>(
    "/api/admin/platform/auth/oauth/providers",
    {
      meta: withBackofficeAuth(),
      transform: (payload) =>
        platformOAuthAdminProviderListSchema.parse(payload),
    }
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
  return adminApiClient.Put<
    z.infer<typeof platformOAuthAdminProviderMutationSchema>,
    unknown
  >(`/api/admin/platform/auth/oauth/${provider}`, input, {
    meta: withBackofficeCsrf(),
    transform: (payload) =>
      platformOAuthAdminProviderMutationSchema.parse(payload),
  })
}
