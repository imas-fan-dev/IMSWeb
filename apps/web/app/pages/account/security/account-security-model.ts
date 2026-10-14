import { isApiError } from "~/lib/api"

/**
 * Error predicates for the account-security endpoints.
 *
 * Every one of these codes means something specific that the user can act on,
 * so they are matched individually rather than collapsed into one "request
 * failed" banner. The status is matched alongside the code because the codes
 * are only unique within their status on the server side.
 */
function matches(error: unknown, status: number, code: string): boolean {
  return isApiError(error) && error.status === status && error.code === code
}

/**
 * The submitted current password did not match.
 *
 * The API answers 403 rather than 401 on purpose: a 401 would make the platform
 * client spend its refresh token on a retry wave instead of surfacing a form
 * error. Treat this as a validation failure on the current-password field.
 */
export function isCurrentPasswordInvalid(error: unknown): boolean {
  return matches(error, 403, "PLATFORM_PASSWORD_CURRENT_INVALID")
}

export function isPasswordInputInvalid(error: unknown): boolean {
  return matches(error, 400, "PLATFORM_PASSWORD_INPUT_INVALID")
}

export function isPasswordUnchanged(error: unknown): boolean {
  return matches(error, 400, "PLATFORM_PASSWORD_UNCHANGED")
}

/**
 * The account has no password credential at all (a provider-only sign-up).
 *
 * There is no read endpoint that reports this up front, so this 409 is the only
 * signal the UI gets; it answers by retiring the form rather than by showing an
 * error the user cannot resolve.
 */
export function isPasswordUnavailable(error: unknown): boolean {
  return matches(error, 409, "PLATFORM_PASSWORD_UNAVAILABLE")
}

export function isPasswordConflict(error: unknown): boolean {
  return matches(error, 409, "PLATFORM_PASSWORD_CONFLICT")
}

/** Unlinking would leave the account with no usable way to sign in. */
export function isLastLoginMethod(error: unknown): boolean {
  return matches(error, 409, "PLATFORM_OAUTH_LAST_LOGIN_METHOD")
}

export function isSessionNotFound(error: unknown): boolean {
  return matches(error, 404, "PLATFORM_SESSION_NOT_FOUND")
}

export function isOAuthLinkNotFound(error: unknown): boolean {
  return matches(error, 404, "PLATFORM_OAUTH_LINK_NOT_FOUND")
}

export function isRateLimited(error: unknown): boolean {
  return isApiError(error) && error.status === 429
}

/**
 * Email binding / change failures.
 *
 * Each code is a different next action for the user, so they are matched one by
 * one rather than collapsed: a taken address needs a new address, a bad code
 * needs a new code, and a stale-state conflict needs a reload.
 */
export function isEmailConflict(error: unknown): boolean {
  return matches(error, 409, "PLATFORM_EMAIL_CONFLICT")
}

export function isEmailUnchanged(error: unknown): boolean {
  return matches(error, 400, "PLATFORM_EMAIL_UNCHANGED")
}

export function isEmailAlreadyBound(error: unknown): boolean {
  return matches(error, 409, "PLATFORM_EMAIL_ALREADY_BOUND")
}

export function isEmailNotBound(error: unknown): boolean {
  return matches(error, 409, "PLATFORM_EMAIL_NOT_BOUND")
}

export function isEmailVerificationInvalid(error: unknown): boolean {
  return matches(error, 400, "PLATFORM_EMAIL_VERIFICATION_INVALID")
}

export function isEmailStateConflict(error: unknown): boolean {
  return matches(error, 409, "PLATFORM_EMAIL_STATE_CONFLICT")
}

export function isEmailInputInvalid(error: unknown): boolean {
  return matches(error, 400, "PLATFORM_EMAIL_INPUT_INVALID")
}

export function isEmailUnavailable(error: unknown): boolean {
  return matches(error, 503, "PLATFORM_EMAIL_VERIFICATION_UNAVAILABLE")
}

/**
 * The `?oauth=` reason the API appends when it hands the OAuth round trip back.
 *
 * Success and failure share one channel, and the reason set is closed, so an
 * unknown value must degrade to the generic failure instead of leaking into the
 * UI as a raw token.
 */
export type PlatformOAuthLinkReasonKey =
  | "platformAccount.security.oauth.linked"
  | "platformAccount.security.oauth.linkConflict"
  | "platformAccount.security.oauth.linkAlreadyBound"
  | "platformAccount.security.oauth.linkUnavailable"
  | "platformAccount.security.oauth.linkExpired"
  | "platformAccount.security.oauth.linkDenied"
  | "platformAccount.security.oauth.linkFailed"

export function oauthLinkReasonKey(
  reason: string | null
): PlatformOAuthLinkReasonKey | null {
  switch (reason) {
    case "linked":
      return "platformAccount.security.oauth.linked"
    case "link-conflict":
      return "platformAccount.security.oauth.linkConflict"
    case "link-already-bound":
      return "platformAccount.security.oauth.linkAlreadyBound"
    case "link-unavailable":
      return "platformAccount.security.oauth.linkUnavailable"
    case "link-expired":
      return "platformAccount.security.oauth.linkExpired"
    case "denied":
      // Only the app link channel delivers this one: a browser refusal on the
      // web path returns to the login page. Saying "you cancelled" is the
      // difference between a dead end and an obvious retry.
      return "platformAccount.security.oauth.linkDenied"
    case "link-invalid":
    case "link-failed":
      return "platformAccount.security.oauth.linkFailed"
    default:
      return null
  }
}

export function isOAuthLinkSuccess(reason: string | null): boolean {
  return reason === "linked"
}

/**
 * Epoch milliseconds as a human-readable local timestamp.
 *
 * `Intl` resolves the locale itself; an unsupported tag falls back to the
 * runtime default rather than throwing and blanking the row.
 */
export function formatTimestamp(value: number, language: string): string {
  try {
    return new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value))
  } catch {
    return new Date(value).toISOString()
  }
}
