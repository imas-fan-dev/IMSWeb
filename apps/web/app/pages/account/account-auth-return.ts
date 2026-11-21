const ACCOUNT_ORIGIN = "https://account.invalid"

/** 分享页只有两种形状：`/exchange/card/<slug>` 与 `/exchange/<handle>`。 */
const SHARE_PAGE_PATTERN = /^\/exchange\/(?:card\/[^/]+|[^/]+)$/

/**
 * Public account authentication can return only to the account workspace, or
 * to a namecard share page (the same-origin links the share pages hand out).
 */
export function accountReturnTo(
  value: string | null | undefined
): string | null {
  if (
    !value ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  )
    return null
  try {
    const url = new URL(value, ACCOUNT_ORIGIN)
    if (
      url.origin !== ACCOUNT_ORIGIN ||
      !(
        url.pathname === "/account/me" ||
        url.pathname.startsWith("/account/me/") ||
        url.pathname === "/account/security" ||
        SHARE_PAGE_PATTERN.test(url.pathname)
      )
    )
      return null
    return url.pathname + url.search + url.hash
  } catch {
    return null
  }
}

export function accountAuthPath(
  page: "login" | "register" | "password-reset",
  returnTo?: string | null,
  feedback: { reset?: boolean } = {}
): string {
  const query = new URLSearchParams()
  const destination = accountReturnTo(returnTo)
  if (destination) query.set("returnTo", destination)
  if (feedback.reset) query.set("reset", "success")
  const search = query.toString()
  return `/account/${page}${search ? `?${search}` : ""}`
}
