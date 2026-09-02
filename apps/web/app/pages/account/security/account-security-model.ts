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
