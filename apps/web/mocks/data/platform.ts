import type {
  PlatformProfile,
  PlatformProfileResponse,
  PlatformSession,
} from "@imsweb/contracts/platform"

/**
 * `PlatformProfile` is the session profile plus `updatedAt`. Both response
 * shapes embed the same four profile fields, so they are written once here.
 */
type PlatformSessionProfile = PlatformSession["profile"]

export function makePlatformSessionProfile(
  overrides: Partial<PlatformSessionProfile> = {}
): PlatformSessionProfile {
  return {
    displayName: "制作人",
    avatarUrl: "/platform-avatars/acct-1.webp",
    homeCity: "广州",
    bio: "",
    ...overrides,
  }
}

export function makePlatformProfile(
  overrides: Partial<PlatformProfile> = {}
): PlatformProfile {
  return {
    ...makePlatformSessionProfile(),
    updatedAt: 1767200000,
    ...overrides,
  }
}

export function makePlatformSession(
  overrides: Partial<PlatformSession> = {}
): PlatformSession {
  return {
    success: true,
    account: { id: "acct-1", status: "active" },
    profile: makePlatformSessionProfile(),
    ...overrides,
  }
}

export function makePlatformProfileResponse(
  overrides: Partial<PlatformProfileResponse> = {}
): PlatformProfileResponse {
  return {
    success: true,
    account: { id: "acct-1", status: "active" },
    profile: makePlatformProfile(),
    capabilities: { fudabaWrite: true },
    ...overrides,
  }
}
