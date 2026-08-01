import { z } from "zod"

import { readCookie } from "../cookies"
import { platformApiClient } from "../platform-client"
import { PLATFORM_CSRF_COOKIE_NAME } from "../request"
import { withPlatformAuth, withPlatformCsrf } from "../types"

const platformSessionSchema = z.object({
  success: z.literal(true),
  account: z.object({
    id: z.string().min(1),
    status: z.enum(["active", "restricted"]),
  }),
  profile: z.object({
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
    homeCity: z.string().nullable(),
    bio: z.string(),
  }),
})

export type PlatformSession = z.infer<typeof platformSessionSchema>

export function hasPlatformSessionHint() {
  return Boolean(readCookie(PLATFORM_CSRF_COOKIE_NAME))
}

export function getPlatformSession() {
  return platformApiClient.Get<PlatformSession, unknown>(
    "/api/platform/auth/session",
    {
      meta: withPlatformAuth(),
      transform: (payload) => platformSessionSchema.parse(payload),
    }
  )
}

export function logoutPlatform() {
  return platformApiClient.Post<{ success: true }, unknown>(
    "/api/platform/auth/logout",
    undefined,
    {
      meta: withPlatformCsrf({ authRole: "logout" }),
    }
  )
}
