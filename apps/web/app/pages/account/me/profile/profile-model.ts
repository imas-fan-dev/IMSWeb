import { isApiError, type PlatformProfile } from "~/lib/api"

export function profileFields(profile: PlatformProfile) {
  return {
    displayName: profile.displayName,
    homeCity: profile.homeCity ?? "",
    bio: profile.bio,
  }
}

export function isProfileConflict(error: unknown) {
  return (
    isApiError(error) &&
    error.status === 409 &&
    error.code === "PLATFORM_PROFILE_CONFLICT"
  )
}
