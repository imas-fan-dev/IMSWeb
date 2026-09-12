export const NATIVE_TAB_BAR_SUPPRESSION_EVENT = "ims:native-tab-bar-suppression"

let nativeTabBarSuppressionCount = 0

function dispatchNativeTabBarSuppression() {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent(NATIVE_TAB_BAR_SUPPRESSION_EVENT, {
      detail: { suppressed: nativeTabBarSuppressionCount > 0 },
    })
  )
}

export function suppressNativeTabBar(): () => void {
  const wasSuppressed = nativeTabBarSuppressionCount > 0
  nativeTabBarSuppressionCount += 1
  if (!wasSuppressed) dispatchNativeTabBarSuppression()

  let released = false
  return () => {
    if (released) return
    released = true
    nativeTabBarSuppressionCount = Math.max(0, nativeTabBarSuppressionCount - 1)
    if (nativeTabBarSuppressionCount === 0) {
      dispatchNativeTabBarSuppression()
    }
  }
}

export function isNativeTabBarSuppressed(): boolean {
  return nativeTabBarSuppressionCount > 0
}

export function nativeTabBarSuppressed(event: Event): boolean | null {
  if (!(event instanceof CustomEvent)) return null
  const detail = event.detail as { suppressed?: unknown } | null
  return typeof detail?.suppressed === "boolean" ? detail.suppressed : null
}
