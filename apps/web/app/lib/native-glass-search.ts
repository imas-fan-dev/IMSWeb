import { invoke } from "@tauri-apps/api/core"
import type { NativeGlassFrame } from "./native-glass-panel"
import type { NativeGlassStatus } from "./native-glass"

export const NATIVE_GLASS_SEARCH_EVENT = "ims:native-glass-search"
export type NativeSearchDetent = "collapsed" | "medium" | "large"
export type NativeGlassSearchSnapshot = {
  id: string
  generation: number
  revision: number
  host: NativeGlassFrame
  bottomClearance: number
  dark: boolean
  detent: NativeSearchDetent
  editing: boolean
  query: string
  busy: boolean
  message: string
  attribution: string
  selected: string
  filterApplied: boolean
  pointCount: number
  hasAttribution: boolean
  results: { id: string; label: string; address: string }[]
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
    ].includes(String(detail.action))
  )
    return null
  if (
    ["input", "submit", "select", "detent", "tool"].includes(
      String(detail.action)
    ) &&
    typeof detail.value !== "string"
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
