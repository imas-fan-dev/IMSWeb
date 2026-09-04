import { useSyncExternalStore } from "react"

type SafeAreaCollisionBoundary = {
  x: number
  y: number
  width: number
  height: number
}

const listeners = new Set<() => void>()
let currentBoundary: SafeAreaCollisionBoundary | undefined
let listening = false

function cssPixels(styles: CSSStyleDeclaration, property: string) {
  const value = Number.parseFloat(styles.getPropertyValue(property))
  return Number.isFinite(value) ? value : 0
}

function readBoundary(): SafeAreaCollisionBoundary | undefined {
  if (typeof window === "undefined") return undefined

  const viewport = window.visualViewport
  const styles = window.getComputedStyle(document.documentElement)
  const top = cssPixels(styles, "--safe-area-top")
  const right = cssPixels(styles, "--safe-area-right")
  const bottom = cssPixels(styles, "--safe-area-bottom")
  const left = cssPixels(styles, "--safe-area-left")
  const viewportX = viewport?.offsetLeft ?? 0
  const viewportY = viewport?.offsetTop ?? 0
  const viewportWidth = viewport?.width ?? window.innerWidth
  const viewportHeight = viewport?.height ?? window.innerHeight

  return {
    x: viewportX + left,
    y: viewportY + top,
    width: Math.max(0, viewportWidth - left - right),
    height: Math.max(0, viewportHeight - top - bottom),
  }
}

function boundariesMatch(
  current: SafeAreaCollisionBoundary | undefined,
  next: SafeAreaCollisionBoundary | undefined
) {
  return (
    current?.x === next?.x &&
    current?.y === next?.y &&
    current?.width === next?.width &&
    current?.height === next?.height
  )
}

function updateBoundary() {
  const nextBoundary = readBoundary()
  if (boundariesMatch(currentBoundary, nextBoundary)) return
  currentBoundary = nextBoundary
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!listening && typeof window !== "undefined") {
    listening = true
    window.addEventListener("resize", updateBoundary)
    window.visualViewport?.addEventListener("resize", updateBoundary)
    window.visualViewport?.addEventListener("scroll", updateBoundary)
  }
  updateBoundary()

  return () => {
    listeners.delete(listener)
    if (listeners.size > 0 || !listening || typeof window === "undefined") {
      return
    }
    listening = false
    window.removeEventListener("resize", updateBoundary)
    window.visualViewport?.removeEventListener("resize", updateBoundary)
    window.visualViewport?.removeEventListener("scroll", updateBoundary)
  }
}

export function useSafeAreaCollisionBoundary() {
  return useSyncExternalStore(
    subscribe,
    () => currentBoundary,
    () => undefined
  )
}
