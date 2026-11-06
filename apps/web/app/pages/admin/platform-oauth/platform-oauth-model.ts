import {
  platformOAuthButtonColorSchema,
  platformOAuthProfilePathSchema,
  platformOAuthProviderCodeSchema,
  platformOAuthProviderIconSchema,
  type PlatformOAuthAdminProvider,
  type PlatformOAuthProviderWriteInput,
} from "~/lib/api"

export type ProviderDraft = Omit<
  PlatformOAuthAdminProvider,
  "redirectUri" | "scopes"
> & {
  clientId: string
  clientSecret: string
  redirectUriInput: string
  scopesInput: string
}

export function emptyDraft(): ProviderDraft {
  return {
    code: "",
    displayName: "",
    icon: "globe-2",
    buttonColor: "#111827",
    enabled: false,
    configured: false,
    clientIdMasked: null,
    clientId: "",
    clientSecret: "",
    redirectUriInput: "",
    authorizationEndpoint: "",
    tokenEndpoint: "",
    userInfoEndpoint: "",
    scopesInput: "",
    tokenAuthMethod: "client_secret_post",
    pkceEnabled: true,
    profileSubjectPath: "id",
    profileDisplayNamePath: "name",
    profileDisplayNameFallbackPath: null,
    profileAvatarUrlPath: null,
    updatedAt: 0,
  }
}

export function toDraft(provider: PlatformOAuthAdminProvider): ProviderDraft {
  return {
    ...provider,
    clientId: "",
    clientSecret: "",
    redirectUriInput: provider.redirectUri ?? "",
    scopesInput: provider.scopes.join(" "),
  }
}

function scopesFromInput(value: string) {
  return [
    ...new Set(
      value
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter(Boolean)
    ),
  ]
}

function absoluteOAuthUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

function nullablePath(value: string | null) {
  const normalized = value?.trim() ?? ""
  return normalized || null
}

export function providerInput(
  draft: ProviderDraft
): PlatformOAuthProviderWriteInput {
  return {
    displayName: draft.displayName.trim(),
    icon: draft.icon,
    buttonColor: draft.buttonColor.toLowerCase(),
    enabled: draft.enabled,
    ...(draft.clientId.trim() ? { clientId: draft.clientId.trim() } : {}),
    ...(draft.clientSecret.trim()
      ? { clientSecret: draft.clientSecret.trim() }
      : {}),
    ...(draft.redirectUriInput.trim()
      ? { redirectUri: draft.redirectUriInput.trim() }
      : {}),
    authorizationEndpoint: draft.authorizationEndpoint.trim(),
    tokenEndpoint: draft.tokenEndpoint.trim(),
    userInfoEndpoint: draft.userInfoEndpoint.trim(),
    scopes: scopesFromInput(draft.scopesInput),
    tokenAuthMethod: draft.tokenAuthMethod,
    pkceEnabled: draft.pkceEnabled,
    profileSubjectPath: draft.profileSubjectPath.trim(),
    profileDisplayNamePath: draft.profileDisplayNamePath.trim(),
    profileDisplayNameFallbackPath: nullablePath(
      draft.profileDisplayNameFallbackPath
    ),
    profileAvatarUrlPath: nullablePath(draft.profileAvatarUrlPath),
  }
}

export function validDraft(draft: ProviderDraft, creating: boolean) {
  const requiredPaths = [draft.profileSubjectPath, draft.profileDisplayNamePath]
  const optionalPaths = [
    draft.profileDisplayNameFallbackPath,
    draft.profileAvatarUrlPath,
  ].filter(Boolean)
  return Boolean(
    (!creating ||
      platformOAuthProviderCodeSchema.safeParse(draft.code).success) &&
    draft.displayName.trim() &&
    platformOAuthProviderIconSchema.safeParse(draft.icon).success &&
    platformOAuthButtonColorSchema.safeParse(draft.buttonColor).success &&
    [
      draft.authorizationEndpoint,
      draft.tokenEndpoint,
      draft.userInfoEndpoint,
    ].every(absoluteOAuthUrl) &&
    requiredPaths.every(
      (path) => platformOAuthProfilePathSchema.safeParse(path).success
    ) &&
    optionalPaths.every(
      (path) => platformOAuthProfilePathSchema.safeParse(path).success
    ) &&
    (!draft.enabled ||
      (draft.redirectUriInput.trim() &&
        (draft.configured ||
          (draft.clientId.trim() && draft.clientSecret.trim()))))
  )
}
