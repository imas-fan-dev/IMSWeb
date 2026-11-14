import { invoke } from "@tauri-apps/api/core"
import type { NativeGlassFrame } from "./native-glass-panel"
import type { NativeGlassColor, NativeGlassStatus } from "./native-glass"

export const NATIVE_GLASS_SEARCH_EVENT = "ims:native-glass-search"

// Keep a dynamic brand tint readable on the map's semantic light/dark surface.
// A dark document can supply a brighter primary while the map remains light.
export function nativeGlassSearchTint(
  rgba: Uint8ClampedArray,
  dark: boolean
): NativeGlassColor {
  let channels = Array.from(rgba.slice(0, 3), (value) => value / 255)
  const luminance = () =>
    channels.reduce((sum, value, index) => {
      const linear =
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      return sum + linear * [0.2126, 0.7152, 0.0722][index]!
    }, 0)
  for (let step = 0; step < 100; step++) {
    const light = luminance()
    if ((dark ? (light + 0.05) / 0.05 : 1.05 / (light + 0.05)) >= 4.5) break
    channels = channels.map((value) =>
      dark ? value + (1 - value) * 0.05 : value * 0.95
    )
  }
  return {
    red: channels[0]!,
    green: channels[1]!,
    blue: channels[2]!,
    alpha: 1,
  }
}
export type NativeSearchDetent = "collapsed" | "medium" | "large"
export type NativeSearchStatus = {
  kind: "idle" | "loading" | "empty" | "error" | "notice"
  title: string
  description: string
}
export type NativeGlassSearchSnapshot = {
  id: string
  generation: number
  revision: number
  activeTab?: "offices" | "places"
  hasMore?: boolean
  host: NativeGlassFrame
  /** Actual visible DOM tab capsule, in CSS viewport coordinates. */
  navigationFrame?: NativeGlassFrame
  bottomClearance: number
  dark: boolean
  tint?: NativeGlassColor
  refreshing?: boolean
  returnFocusMore?: boolean
  detent: NativeSearchDetent
  editing: boolean
  query: string
  busy: boolean
  status: NativeSearchStatus | null
  attribution: string
  selected: string
  selectedLabel?: string
  selectedAddress?: string
  filterApplied: boolean
  pointCount: number
  hasAttribution: boolean
  results: { id: string; label: string; address: string; disabled?: boolean }[]
  labels: Record<string, string>
}
export type NativeGlassSearchEvent = {
  id: string
  generation: number
  revision: number
  action:
    | "input"
    | "submit"
    | "cancel"
    | "select"
    | "clear"
    | "detent"
    | "geometry"
    | "tool"
    | "tab"
    | "loadMore"
  value?: string
  frame?: NativeGlassFrame
}

export function syncNativeGlassSearch(args: NativeGlassSearchSnapshot) {
  return invoke<NativeGlassStatus>("plugin:native-glass|set_search", { args })
}
export function removeNativeGlassSearch(id: string, generation: number) {
  return invoke<void>("plugin:native-glass|remove_search", {
    args: { id, generation },
  })
}
export function nativeGlassSearchEvent(
  event: Event
): NativeGlassSearchEvent | null {
  if (
    !(event instanceof CustomEvent) ||
    !event.detail ||
    typeof event.detail !== "object"
  )
    return null
  const detail = event.detail as Record<string, unknown>
  if (
    typeof detail.id !== "string" ||
    !detail.id ||
    !Number.isSafeInteger(detail.generation) ||
    !Number.isSafeInteger(detail.revision) ||
    Number(detail.generation) < 0 ||
    Number(detail.revision) < 0
  )
    return null
  if (
    ![
      "input",
      "submit",
      "cancel",
      "select",
      "clear",
      "detent",
      "geometry",
      "tool",
      "tab",
      "loadMore",
    ].includes(String(detail.action))
  )
    return null
  if (
    ["input", "submit", "select", "detent", "tool", "tab"].includes(
      String(detail.action)
    ) &&
    typeof detail.value !== "string"
  )
    return null
  if (
    detail.action === "tab" &&
    !["offices", "places"].includes(String(detail.value))
  )
    return null
  if (detail.action === "geometry") {
    const frame = detail.frame as Record<string, unknown> | undefined
    if (
      !frame ||
      ![frame.x, frame.y, frame.width, frame.height].every(
        (value) => typeof value === "number" && Number.isFinite(value)
      ) ||
      Number(frame.width) <= 0 ||
      Number(frame.height) <= 0
    )
      return null
  }
  return detail as NativeGlassSearchEvent
}
