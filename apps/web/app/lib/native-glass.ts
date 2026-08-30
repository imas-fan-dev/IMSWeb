import { invoke, isTauri } from "@tauri-apps/api/core"

import { IS_APP_TARGET } from "~/lib/app-target"

export const NATIVE_TAB_SELECT_EVENT = "ims:native-tab-select"

export type NativeGlassTabItem = {
  route: string
  lucideIcon: string
  title: string
}

export type NativeGlassConfigureOptions = {
  dark: boolean
  items: NativeGlassTabItem[]
  selectedIndex: number
}

export type NativeGlassUpdateOptions = Pick<
  NativeGlassConfigureOptions,
  "dark" | "selectedIndex"
>

export type NativeGlassStatus = {
  reason?: string
  supported: boolean
}

type AppleRuntimeIdentity = {
  maxTouchPoints: number
  platform: string
  userAgent: string
}

export function isIosRuntimeIdentity({
  maxTouchPoints,
  platform,
  userAgent,
}: AppleRuntimeIdentity): boolean {
  return (
    /\b(iPad|iPhone|iPod)\b/i.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1)
  )
}

export function shouldAttemptNativeGlass(): boolean {
  if (!IS_APP_TARGET || typeof window === "undefined" || !isTauri()) {
    return false
  }

  return isIosRuntimeIdentity({
    maxTouchPoints: window.navigator.maxTouchPoints,
    platform: window.navigator.platform,
    userAgent: window.navigator.userAgent,
  })
}

export async function configureNativeGlass(
  options: NativeGlassConfigureOptions
): Promise<NativeGlassStatus> {
  return invoke<NativeGlassStatus>("plugin:native-glass|configure", { options })
}

export async function updateNativeGlass(
  options: NativeGlassUpdateOptions
): Promise<NativeGlassStatus> {
  return invoke<NativeGlassStatus>("plugin:native-glass|update", { options })
}

export async function destroyNativeGlass(): Promise<void> {
  await invoke("plugin:native-glass|destroy")
}

export function nativeTabRoute(event: Event): string | null {
  if (!(event instanceof CustomEvent)) return null
  const detail = event.detail as { route?: unknown } | null
  return typeof detail?.route === "string" ? detail.route : null
}
