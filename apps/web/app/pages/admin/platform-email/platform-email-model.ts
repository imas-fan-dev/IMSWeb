import {
  adminPlatformEmailConfigurationTestRequestSchema,
  adminPlatformEmailConfigurationWriteRequestSchema,
} from "@imsweb/contracts/platform/admin-email"
import type {
  AdminPlatformEmailConfigurationInput,
  AdminPlatformEmailConfigurationTestInput,
  AdminPlatformEmailSecurity,
  AdminPlatformEmailSettings,
} from "~/lib/api"

export interface PlatformEmailDraft {
  enabled: boolean
  configured: boolean
  host: string
  port: string
  security: AdminPlatformEmailSecurity
  username: string
  usernameMasked: string | null
  password: string
  passwordConfigured: boolean
  fromAddress: string
  fromName: string
  testRecipient: string
  updatedAt: number
}

export function emptyPlatformEmailDraft(): PlatformEmailDraft {
  return {
    enabled: false,
    configured: false,
    host: "",
    port: "465",
    security: "tls",
    username: "",
    usernameMasked: null,
    password: "",
    passwordConfigured: false,
    fromAddress: "",
    fromName: "IMSWeb",
    testRecipient: "",
    updatedAt: 0,
  }
}

export function platformEmailDraft(
  settings: AdminPlatformEmailSettings
): PlatformEmailDraft {
  return {
    ...settings,
    port: String(settings.port),
    username: "",
    password: "",
    testRecipient: "",
  }
}

export function platformEmailConfigurationInput(
  draft: PlatformEmailDraft
): AdminPlatformEmailConfigurationInput {
  return {
    enabled: draft.enabled,
    host: draft.host,
    port: Number(draft.port),
    security: draft.security,
    ...(draft.username.trim() ? { username: draft.username.trim() } : {}),
    ...(draft.password ? { password: draft.password } : {}),
    fromAddress: draft.fromAddress,
    fromName: draft.fromName,
    expectedUpdatedAt: draft.updatedAt,
  }
}

function credentialsAvailable(draft: PlatformEmailDraft) {
  return Boolean(
    (draft.username.trim() || draft.usernameMasked) &&
    (draft.password || draft.passwordConfigured)
  )
}

export function validPlatformEmailDraft(draft: PlatformEmailDraft) {
  const parsed = adminPlatformEmailConfigurationWriteRequestSchema.safeParse(
    platformEmailConfigurationInput(draft)
  )
  return parsed.success && (!draft.enabled || credentialsAvailable(draft))
}

export function platformEmailTestInput(
  draft: PlatformEmailDraft
): AdminPlatformEmailConfigurationTestInput {
  return {
    ...platformEmailConfigurationInput(draft),
    recipient: draft.testRecipient,
  }
}

export function testablePlatformEmailDraft(draft: PlatformEmailDraft) {
  return (
    credentialsAvailable(draft) &&
    adminPlatformEmailConfigurationTestRequestSchema.safeParse(
      platformEmailTestInput(draft)
    ).success
  )
}
