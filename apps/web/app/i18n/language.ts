import { defaultLanguage, type SupportedLanguage } from "./resources"

export const languageStorageKey = "imsweb.language"

export function resolveLanguage(
  candidates: readonly (string | null | undefined)[]
): SupportedLanguage {
  for (const candidate of candidates) {
    const normalized = candidate?.trim().replaceAll("_", "-").toLowerCase()

    if (normalized === "zh" || normalized?.startsWith("zh-")) {
      return "zh-CN"
    }

    if (normalized === "en" || normalized?.startsWith("en-")) {
      return "en"
    }
  }

  return defaultLanguage
}

export function detectBrowserLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return defaultLanguage

  let storedLanguage: string | null = null

  try {
    storedLanguage = window.localStorage.getItem(languageStorageKey)
  } catch {
    // Storage can be unavailable in private or locked-down browser contexts.
  }

  return resolveLanguage([
    storedLanguage,
    ...window.navigator.languages,
    window.navigator.language,
  ])
}

export function persistLanguage(language: SupportedLanguage) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = language
    document.documentElement.dir = "ltr"
  }

  try {
    window.localStorage.setItem(languageStorageKey, language)
  } catch {
    // Language switching still works when persistence is unavailable.
  }
}
