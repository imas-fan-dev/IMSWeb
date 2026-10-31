import { API_ORIGIN, PUBLIC_SITE_ORIGIN } from "~/lib/api"
import {
  openSystemUrl,
  shouldUseSystemOpener,
} from "~/lib/navigation/system-opener"

const LOCAL_DEVELOPMENT_HOST =
  /^(?:127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2})$/

function isLocalDevelopmentOrigin(url: URL): boolean {
  if (!import.meta.env.DEV || !["http:", "https:"].includes(url.protocol)) {
    return false
  }
  if (url.hostname === "localhost" || url.hostname === "::1") return true
  if (LOCAL_DEVELOPMENT_HOST.test(url.hostname)) return true

  const parts = url.hostname.split(".").map(Number)
  return (
    parts.length === 4 &&
    parts[0] === 172 &&
    parts[1] >= 16 &&
    parts[1] <= 31 &&
    parts.slice(2).every((part) => Number.isInteger(part) && part <= 255)
  )
}

export function isAllowedHostedSiteUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  if (
    url.username ||
    url.password ||
    !/^\/sites\/[a-z0-9](?:[a-z0-9-]{0,62})$/.test(url.pathname) ||
    url.search ||
    url.hash
  ) {
    return false
  }

  const configuredOrigins = [PUBLIC_SITE_ORIGIN, API_ORIGIN].filter(Boolean)
  return configuredOrigins.includes(url.origin) || isLocalDevelopmentOrigin(url)
}

export function shouldOpenHostedSiteExternally(): boolean {
  return shouldUseSystemOpener()
}

export async function openHostedSiteUrl(value: string): Promise<void> {
  if (!shouldOpenHostedSiteExternally()) {
    throw new Error("Hosted sites can only be opened externally from Tauri")
  }
  if (!isAllowedHostedSiteUrl(value)) {
    throw new Error("Hosted site URL is outside the App allowlist")
  }

  await openSystemUrl(value)
}
