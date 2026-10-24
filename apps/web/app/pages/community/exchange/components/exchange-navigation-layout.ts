import type { NativeGlassFrame } from "~/lib/native-glass-panel"

export const EXCHANGE_NAVIGATION_LAYOUT_EVENT = "ims:exchange-navigation-layout"

export type ExchangeNavigationLayout = {
  layoutGeneration: number
  revision: number
  route: string
  available: boolean
  visible: boolean
  viewport: { width: number; height: number }
  inline: { x: number; width: number } | null
  /** Public visible navigation body height, excluding safe area and host. */
  bodyHeight?: number
  provenance: "native-public-layout-calibrated"
}

export function exchangeNavigationLayout(
  event: Event,
  viewport: { width: number; height: number },
  previous: ExchangeNavigationLayout | null
): ExchangeNavigationLayout | null {
  if (!(event instanceof CustomEvent)) return null
  const value = event.detail as Partial<ExchangeNavigationLayout> | null
  if (
    !value ||
    value.provenance !== "native-public-layout-calibrated" ||
    value.route !== "/community/exchange" ||
    !Number.isSafeInteger(value.layoutGeneration) ||
    !Number.isSafeInteger(value.revision) ||
    (value.layoutGeneration ?? -1) < 0 ||
    (value.revision ?? -1) < 0 ||
    typeof value.available !== "boolean" ||
    typeof value.visible !== "boolean" ||
    !value.viewport ||
    !Number.isFinite(value.viewport.width) ||
    !Number.isFinite(value.viewport.height) ||
    value.viewport.width < 44 ||
    value.viewport.height <= 0 ||
    Math.abs(value.viewport.width - viewport.width) > 2 ||
    Math.abs(value.viewport.height - viewport.height) > 2
  )
    return null
  if (
    previous &&
    ((value.layoutGeneration ?? 0) < previous.layoutGeneration ||
      (value.layoutGeneration === previous.layoutGeneration &&
        (value.revision ?? 0) <= previous.revision))
  )
    return null
  if (
    value.bodyHeight !== undefined &&
    (!Number.isFinite(value.bodyHeight) ||
      value.bodyHeight < 44 ||
      value.bodyHeight > viewport.height)
  )
    return null
  if (value.available) {
    const inline = value.inline
    if (
      !inline ||
      !Number.isFinite(inline.x) ||
      !Number.isFinite(inline.width) ||
      inline.x < 0 ||
      inline.width < 44 ||
      inline.x + inline.width > viewport.width + 2
    )
      return null
  } else if (value.inline !== null || value.visible) return null
  return value as ExchangeNavigationLayout
}

export function measuredNavigationFrame(
  capsule: Element | null
): NativeGlassFrame | undefined {
  if (!capsule || !capsule.isConnected || capsule.closest("[hidden]"))
    return undefined
  for (const node of [capsule, capsule.parentElement]) {
    if (!node) continue
    const style = getComputedStyle(node)
    if (style.display === "none" || style.visibility === "hidden")
      return undefined
  }
  const box = capsule.getBoundingClientRect()
  if (
    ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
    box.width < 44 ||
    box.height <= 0
  )
    return undefined
  return { x: box.x, y: box.y, width: box.width, height: box.height }
}

/** Dock above the visible DOM body; its offset already includes the safe area. */
export function navigationDockBottom(
  host: NativeGlassFrame,
  visibleEnd: number,
  navigation: NativeGlassFrame | undefined,
  fallback: number
): number {
  if (
    !navigation ||
    !Number.isFinite(navigation.y) ||
    !Number.isFinite(navigation.height) ||
    navigation.height <= 0 ||
    navigation.y < host.y ||
    navigation.y + navigation.height >
      Math.min(host.y + host.height, visibleEnd) + 2
  )
    return fallback
  return Math.max(12, host.y + host.height - navigation.y + 12)
}

export function navigationInline(
  host: NativeGlassFrame,
  viewport: { width: number; height: number },
  dom: NativeGlassFrame | undefined,
  native: ExchangeNavigationLayout | null
): { x: number; width: number } | undefined {
  const currentNative =
    native?.available &&
    Math.abs(native.viewport.width - viewport.width) <= 2 &&
    Math.abs(native.viewport.height - viewport.height) <= 2
      ? native.inline
      : null
  const range = dom ?? currentNative
  if (!range) return undefined
  const left = Math.max(host.x, range.x)
  const right = Math.min(host.x + host.width, range.x + range.width)
  return right - left >= 44
    ? { x: left - host.x, width: right - left }
    : undefined
}
