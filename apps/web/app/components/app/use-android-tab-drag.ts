import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react"

import {
  isNativeTabBarInteractionBlocked,
  NATIVE_TAB_BAR_SUPPRESSION_EVENT,
} from "~/lib/native-tab-bar-suppression"

interface DragOptions {
  enabled: boolean
  selectedIndex: number
  count: number
  routeKey: string
  onSelect: (index: number) => void
}

interface Gesture {
  pointerId: number
  x: number
  y: number
  left: number
  slotWidth: number
  index: number
  dragging: boolean
}

/** Transient lens movement never commits navigation until pointer release. */
export function useAndroidTabDrag({
  enabled,
  selectedIndex,
  count,
  routeKey,
  onSelect,
}: DragOptions) {
  const ref = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const suppressClickUntil = useRef(0)

  function reset() {
    const current = gesture.current
    gesture.current = null
    const element = ref.current
    if (!element) return
    element.removeAttribute("data-tab-dragging")
    element.style.removeProperty("--android-tab-index")
    element.style.removeProperty("--android-tab-stretch")
    if (current && element.hasPointerCapture?.(current.pointerId)) {
      element.releasePointerCapture(current.pointerId)
    }
  }

  useEffect(() => {
    function cancel() {
      if (gesture.current?.dragging)
        suppressClickUntil.current = Date.now() + 600
      reset()
    }
    function onLeaseChange() {
      if (isNativeTabBarInteractionBlocked()) cancel()
    }
    window.addEventListener(NATIVE_TAB_BAR_SUPPRESSION_EVENT, onLeaseChange)
    window.addEventListener("resize", cancel)
    window.addEventListener("orientationchange", cancel)
    return () => {
      window.removeEventListener(
        NATIVE_TAB_BAR_SUPPRESSION_EVENT,
        onLeaseChange
      )
      window.removeEventListener("resize", cancel)
      window.removeEventListener("orientationchange", cancel)
      cancel()
    }
  }, [enabled, selectedIndex, routeKey])

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (
      !enabled ||
      selectedIndex < 0 ||
      gesture.current ||
      isNativeTabBarInteractionBlocked() ||
      !event.isPrimary ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return
    suppressClickUntil.current = 0
    const element = ref.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    // Resolve the rem-based capsule padding once, alongside its geometry.
    const style = window.getComputedStyle(element)
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
    const paddingRight = Number.parseFloat(style.paddingRight) || 0
    const slotWidth = (rect.width - paddingLeft - paddingRight) / count
    if (slotWidth <= 0) return
    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: rect.left + paddingLeft,
      slotWidth,
      index: selectedIndex,
      dragging: false,
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    if (!enabled || isNativeTabBarInteractionBlocked()) {
      reset()
      return
    }
    const dx = Math.abs(event.clientX - current.x)
    const dy = Math.abs(event.clientY - current.y)
    if (!current.dragging) {
      if (Math.max(dx, dy) < 8) return
      if (dy >= dx) {
        reset()
        return
      }
      current.dragging = true
      ref.current?.setPointerCapture(event.pointerId)
    }
    event.preventDefault()
    const index = Math.max(
      0,
      Math.min(
        count - 1,
        (event.clientX - current.left) / current.slotWidth - 0.5
      )
    )
    const stretch = Math.min(0.12, Math.abs(index - current.index) * 0.07)
    current.index = index
    ref.current?.setAttribute("data-tab-dragging", "")
    ref.current?.style.setProperty("--android-tab-index", String(index))
    ref.current?.style.setProperty("--android-tab-stretch", String(stretch))
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    // Include a release position that arrived without a final move event.
    if (current.dragging) onPointerMove(event)
    const commit =
      current.dragging && enabled && !isNativeTabBarInteractionBlocked()
    if (current.dragging) {
      event.preventDefault()
      suppressClickUntil.current = Date.now() + 600
    }
    reset()
    if (commit) onSelect(Math.round(current.index))
  }

  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.pointerId !== event.pointerId) return
    if (gesture.current.dragging) suppressClickUntil.current = Date.now() + 600
    reset()
  }

  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (
      event.detail > 0 &&
      Date.now() < suppressClickUntil.current &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey
    ) {
      suppressClickUntil.current = 0
      event.preventDefault()
      event.stopPropagation()
    }
  }

  return {
    ref,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => {
      // Touch starts with implicit capture on the link. Transferring it to the
      // capsule must not treat the link's bubbling capture loss as cancellation.
      if (event.target === ref.current) onPointerCancel(event)
    },
    onClickCapture,
  }
}
