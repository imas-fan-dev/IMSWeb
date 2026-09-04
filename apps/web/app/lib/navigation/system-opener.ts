import { isTauri } from "@tauri-apps/api/core"

import { IS_APP_TARGET } from "~/lib/app-target"

export function shouldUseSystemOpener(): boolean {
  return IS_APP_TARGET && isTauri()
}

const BLOCKED_SYSTEM_PROTOCOLS = new Set([
  "about:",
  "asset:",
  "blob:",
  "content:",
  "data:",
  "file:",
  "filesystem:",
  "javascript:",
  "tauri:",
])

export function normalizeSystemUrl(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (
    url.username ||
    url.password ||
    BLOCKED_SYSTEM_PROTOCOLS.has(url.protocol)
  ) {
    return null
  }

  return url.href
}

export function isAllowedSystemUrl(value: string): boolean {
  return normalizeSystemUrl(value) !== null
}

export async function openSystemUrl(value: string): Promise<void> {
  if (!shouldUseSystemOpener()) {
    throw new Error("System URLs can only be opened from Tauri")
  }

  const normalizedUrl = normalizeSystemUrl(value)
  if (!normalizedUrl) {
    throw new Error("System URL uses a blocked scheme")
  }

  const { openUrl } = await import("@tauri-apps/plugin-opener")
  await openUrl(normalizedUrl)
}
