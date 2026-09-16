import {
  BACKOFFICE_CSRF_COOKIE_NAME,
  LEGACY_BACKOFFICE_CSRF_COOKIE_NAME,
  PLATFORM_CSRF_COOKIE_NAME,
} from "~/lib/api/request"

/**
 * Which CSRF cookie a test is seeding or clearing.
 *
 * The three names are owned by `~/lib/api/request`; this type keeps callers
 * from restating the wire name, and keeps the `path=/` requirement in one
 * place. A cookie written without it is invisible to the code under test.
 */
export type CsrfCookieName = "backoffice" | "platform" | "legacy"

const CSRF_COOKIE_NAMES: Record<CsrfCookieName, string> = {
  backoffice: BACKOFFICE_CSRF_COOKIE_NAME,
  platform: PLATFORM_CSRF_COOKIE_NAME,
  legacy: LEGACY_BACKOFFICE_CSRF_COOKIE_NAME,
}

const COOKIE_PATH = "path=/"

export function setCsrfCookie(name: CsrfCookieName, value: string): void {
  document.cookie = `${CSRF_COOKIE_NAMES[name]}=${value}; ${COOKIE_PATH}`
}

export function clearCsrfCookie(name: CsrfCookieName): void {
  document.cookie = `${CSRF_COOKIE_NAMES[name]}=; Max-Age=0; ${COOKIE_PATH}`
}
