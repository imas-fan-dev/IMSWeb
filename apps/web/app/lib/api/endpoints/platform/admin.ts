import { adminPlatformAuthOAuthPath } from "@imsweb/contracts/paths"
import {
  platformOAuthAdminProviderDeleteSchema,
  platformOAuthAdminProviderListSchema,
  platformOAuthAdminProviderMutationSchema,
  type PlatformOAuthAdminProvider,
  type PlatformOAuthTokenAuthMethod,
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

export interface PlatformOAuthProviderWriteInput {
  displayName: string
  icon: string
  buttonColor: string
  enabled: boolean
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  authorizationEndpoint: string
  tokenEndpoint: string
  userInfoEndpoint: string
  scopes: string[]
  tokenAuthMethod: PlatformOAuthTokenAuthMethod
  pkceEnabled: boolean
  profileSubjectPath: string
  profileDisplayNamePath: string
  profileDisplayNameFallbackPath: string | null
  profileAvatarUrlPath: string | null
}

export interface PlatformOAuthProviderCreateInput extends PlatformOAuthProviderWriteInput {
  code: string
}

export interface PlatformOAuthProviderUpdateInput extends PlatformOAuthProviderWriteInput {
  expectedUpdatedAt: number
}

export function getAdminPlatformOAuthProviders() {
  return adminApiClient.Get(
    adminPlatformAuthOAuthPath("/providers"),
    parsed(platformOAuthAdminProviderListSchema, {
      meta: withBackofficeAuth(),
    })
  )
}

export function createAdminPlatformOAuthProvider(
  input: PlatformOAuthProviderCreateInput
) {
  return adminApiClient.Post(
    adminPlatformAuthOAuthPath("/providers"),
    input,
    parsed(platformOAuthAdminProviderMutationSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}

export function updateAdminPlatformOAuthProvider(
  provider: PlatformOAuthAdminProvider["code"],
  input: PlatformOAuthProviderUpdateInput
) {
  return adminApiClient.Put(
    adminPlatformAuthOAuthPath(`/${provider}`),
    input,
    parsed(platformOAuthAdminProviderMutationSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}

export function deleteAdminPlatformOAuthProvider(
  provider: PlatformOAuthAdminProvider["code"],
  expectedUpdatedAt: number
) {
  return adminApiClient.Delete(
    adminPlatformAuthOAuthPath(`/${provider}`),
    { expectedUpdatedAt },
    parsed(platformOAuthAdminProviderDeleteSchema, {
      meta: withBackofficeCsrf(),
    })
  )
}
