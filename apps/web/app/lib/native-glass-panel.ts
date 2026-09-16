import { invoke, isTauri } from "@tauri-apps/api/core"

import { IS_APP_TARGET } from "~/lib/app-target"
import {
  isIosRuntimeIdentity,
  type NativeGlassStatus,
} from "~/lib/native-glass"

export const NATIVE_GLASS_CONTROL_EVENT = "ims:native-glass-control"

export type NativeGlassFrame = {
  x: number
  y: number
  width: number
  height: number
}

export type NativeGlassMenuItem = {
  id: string
  icon: string
  label: string
  active?: boolean
  badge?: boolean
}

type NativeGlassControlBase = {
  id: string
  icon: string
  label: string
  frame: NativeGlassFrame
  cornerRadius: number
}

/**
 * The frozen `set_controls` payload. `frame` uses CSS pixels with the origin at
 * the top-left of the WebView viewport; the native side maps that into UIKit
 * points before it draws. The union mirrors the Rust and Swift models, so a new
 * variant has to be added on all three sides together.
 */
export type NativeGlassControl =
  | (NativeGlassControlBase & {
      kind: "icon-button"
      active?: boolean
      disabled?: boolean
    })
  | (NativeGlassControlBase & {
      kind: "menu"
      expanded: boolean
      panelWidth: number
      items: NativeGlassMenuItem[]
    })

export type NativeGlassControlEvent = {
  id: string
  action: "press" | "menu-item"
  itemId?: string
}

/**
 * Admission check for the native control path, not a capability check. The real
 * verdict is the `supported` flag `syncNativeGlassControls` returns; Android,
 * iOS before 26, and every Web runtime keep the DOM twins.
 */
export function shouldUseNativeGlassControls(): boolean {
  if (!IS_APP_TARGET || typeof window === "undefined" || !isTauri()) {
    return false
  }

  return isIosRuntimeIdentity({
    maxTouchPoints: window.navigator.maxTouchPoints,
    platform: window.navigator.platform,
    userAgent: window.navigator.userAgent,
  })
}

export async function syncNativeGlassControls(
  controls: NativeGlassControl[],
  dark: boolean
): Promise<NativeGlassStatus> {
  return invoke<NativeGlassStatus>("plugin:native-glass|set_controls", {
    args: { controls, dark },
  })
}

/**
 * Parses the `ims:native-glass-control` event. Anything malformed returns
 * `null` rather than guessing at a control or action, mirroring
 * `nativeTabRoute` for the tab bar event.
 */
export function nativeGlassControlEvent(
  event: Event
): NativeGlassControlEvent | null {
  if (!(event instanceof CustomEvent)) return null

  const detail = event.detail as Record<string, unknown> | null
  if (!detail || typeof detail !== "object") return null

  const { id, action, itemId } = detail
  if (typeof id !== "string" || id.length === 0) return null
  if (
    "itemId" in detail &&
    itemId !== undefined &&
    typeof itemId !== "string"
  ) {
    return null
  }

  if (action === "press") {
    return { id, action }
  }

  if (
    action === "menu-item" &&
    typeof itemId === "string" &&
    itemId.length > 0
  ) {
    return { id, action, itemId }
  }

  return null
}
