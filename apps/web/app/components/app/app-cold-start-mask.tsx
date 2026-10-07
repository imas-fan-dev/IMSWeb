import { useEffect, useState } from "react"

import { BrandWordmark } from "~/components/shared/brand-wordmark"

/**
 * Covers the gap between the native splash screen tearing down and React
 * painting its first frame.
 *
 * This ships inside the prerendered HTML, so it is on screen before any
 * JavaScript runs. It is deliberately decoupled from auth: the packaged app
 * cannot read the platform session cookie cross-origin, so there is no session
 * to wait for and gating the mask on one would hang forever.
 */
export function AppColdStartMask() {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Wait for a painted frame rather than dismissing on mount, otherwise the
    // mask can disappear while the first route is still blank. iOS can defer
    // the first WebView frame while the native tab bar is materializing, so a
    // timer releases the mask if that callback does not arrive promptly.
    const dismiss = () => setDismissed(true)
    const frame = requestAnimationFrame(dismiss)
    const fallback = window.setTimeout(dismiss, 250)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(fallback)
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      data-app-cold-start-mask=""
      data-dismissed={dismissed || undefined}
      className="pointer-events-none fixed inset-0 z-100 flex items-center justify-center bg-background transition-opacity duration-500 ease-out data-dismissed:opacity-0 motion-reduce:transition-none"
    >
      <BrandWordmark className="h-10 animate-pulse motion-reduce:animate-none" />
    </div>
  )
}
