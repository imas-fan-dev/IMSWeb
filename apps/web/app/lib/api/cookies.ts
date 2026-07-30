function currentDocumentCookies(): string {
  return typeof document === "undefined" ? "" : document.cookie
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function readCookie(
  name: string,
  cookieSource = currentDocumentCookies()
): string | undefined {
  for (const item of cookieSource.split(";")) {
    const separator = item.indexOf("=")
    if (separator < 0) {
      continue
    }

    const key = item.slice(0, separator).trim()
    if (key === name) {
      return decodeCookieValue(item.slice(separator + 1))
    }
  }

  return undefined
}
