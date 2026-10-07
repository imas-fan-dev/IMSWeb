import {
  API_PATH_PREFIX,
  CSS_PATH_PREFIX,
  EVENT_CHRONICLE_PATH_PREFIX,
  ICON_PATH_PREFIX,
  IMAGE_PATH_PREFIX,
  MAPS_PATH_PREFIX,
  PUBLIC_ASSETS_PATH_PREFIX,
  PUBLIC_UPLOADS_PATH_PREFIX,
  SITE_CONTENT_PATH_PREFIX,
  SITES_PATH_PREFIX,
} from "@imsweb/contracts/paths"
import type { To } from "react-router"

import { API_ORIGIN, PUBLIC_SITE_ORIGIN } from "~/lib/api"
import { IS_APP_TARGET } from "~/lib/app-target"
import {
  isSemanticNavigationTarget,
  type NavigationTarget,
} from "~/lib/navigation/navigation-target"
import { normalizeSystemUrl } from "~/lib/navigation/system-opener"

export interface NavigationRuntime {
  appTarget: boolean
  apiOrigin: string
  publicSiteOrigin: string
  documentOrigin: string
}

export type NavigationDecision =
  | { kind: "router"; to: To }
  | { kind: "document"; href: string }
  | { kind: "system"; href: string }
  | { kind: "unavailable" }

const SERVER_DOCUMENT_PREFIXES = [
  API_PATH_PREFIX,
  CSS_PATH_PREFIX,
  EVENT_CHRONICLE_PATH_PREFIX,
  ICON_PATH_PREFIX,
  IMAGE_PATH_PREFIX,
  MAPS_PATH_PREFIX,
  PUBLIC_ASSETS_PATH_PREFIX,
  PUBLIC_UPLOADS_PATH_PREFIX,
  SITE_CONTENT_PATH_PREFIX,
] as const

function hasPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function resolvedOriginUrl(path: string, origin: string): string | null {
  if (!origin) return null
  try {
    return new URL(path, `${origin}/`).href
  } catch {
    return null
  }
}

function safeExternalUrl(
  value: string,
  runtime: NavigationRuntime
): string | null {
  const candidate = value.trim()
  if (!candidate) return null
  const base = runtime.appTarget
    ? runtime.publicSiteOrigin ||
      runtime.apiOrigin ||
      runtime.documentOrigin ||
      "https://imsweb.invalid"
    : runtime.documentOrigin ||
      runtime.publicSiteOrigin ||
      runtime.apiOrigin ||
      "https://imsweb.invalid"

  let url: URL
  try {
    url = new URL(candidate, base)
  } catch {
    return null
  }

  return normalizeSystemUrl(url.href)
}

function publicPageDecision(
  path: string,
  runtime: NavigationRuntime
): NavigationDecision {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return { kind: "unavailable" }
  }
  if (!runtime.appTarget) return { kind: "document", href: path }

  const href = resolvedOriginUrl(
    path,
    runtime.publicSiteOrigin || runtime.apiOrigin
  )
  return href ? { kind: "system", href } : { kind: "unavailable" }
}

function stringDecision(
  value: string,
  runtime: NavigationRuntime
): NavigationDecision {
  const candidate = value.trim()
  if (!candidate) return { kind: "unavailable" }
  if (candidate.startsWith("#")) {
    return { kind: "document", href: candidate }
  }

  if (candidate.startsWith("//")) {
    const href = safeExternalUrl(candidate, runtime)
    if (!href) return { kind: "unavailable" }
    return runtime.appTarget
      ? { kind: "system", href }
      : { kind: "document", href }
  }

  if (candidate.startsWith("/")) {
    let pathname: string
    try {
      pathname = new URL(candidate, "https://imsweb.invalid").pathname
    } catch {
      return { kind: "unavailable" }
    }

    if (hasPathPrefix(pathname, SITES_PATH_PREFIX)) {
      return publicPageDecision(candidate, runtime)
    }
    if (
      SERVER_DOCUMENT_PREFIXES.some((prefix) => hasPathPrefix(pathname, prefix))
    ) {
      if (!runtime.appTarget) return { kind: "document", href: candidate }
      const href = resolvedOriginUrl(candidate, runtime.apiOrigin)
      return href ? { kind: "document", href } : { kind: "unavailable" }
    }
    return { kind: "router", to: candidate }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    const href = safeExternalUrl(candidate, runtime)
    if (!href) return { kind: "unavailable" }
    return runtime.appTarget
      ? { kind: "system", href }
      : { kind: "document", href }
  }

  return { kind: "router", to: candidate }
}

export function currentNavigationRuntime(): NavigationRuntime {
  return {
    appTarget: IS_APP_TARGET,
    apiOrigin: API_ORIGIN,
    publicSiteOrigin: PUBLIC_SITE_ORIGIN,
    documentOrigin: typeof window === "undefined" ? "" : window.location.origin,
  }
}

export function resolveNavigation(
  target: NavigationTarget,
  runtime: NavigationRuntime = currentNavigationRuntime()
): NavigationDecision {
  if (isSemanticNavigationTarget(target)) {
    if (target.kind === "web-route") {
      return runtime.appTarget
        ? { kind: "unavailable" }
        : { kind: "router", to: target.to }
    }
    if (target.kind === "public-page") {
      return publicPageDecision(target.path, runtime)
    }
    const href = safeExternalUrl(target.url, runtime)
    if (!href) return { kind: "unavailable" }
    return runtime.appTarget
      ? { kind: "system", href }
      : { kind: "document", href }
  }

  return typeof target === "string"
    ? stringDecision(target, runtime)
    : { kind: "router", to: target }
}
