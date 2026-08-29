import { useEffect } from "react"

/**
 * Feeds `.glass-sheen` surfaces the pointer position that their specular
 * highlight gradient reads from.
 *
 * One delegated listener on the document rather than a listener per surface:
 * glass is used on bars, dialogs and cards at the same time, and per-element
 * handlers turn into hundreds of subscriptions on list-heavy pages. Writes are
 * coalesced into a single animation frame, and only two custom properties are
 * touched, so the browser stays on the compositor instead of re-running layout.
 *
 * The highlight is decorative. When the pointer is coarse or the user asked for
 * reduced motion, this does nothing and the CSS falls back to a static surface.
 */
export function GlassSheenTracker() {
  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)")
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

    let frame = 0
    let pending: { target: HTMLElement; x: number; y: number } | null = null
    let active: HTMLElement | null = null

    const clearActive = () => {
      if (!active) return
      active.style.removeProperty("--glass-pointer-x")
      active.style.removeProperty("--glass-pointer-y")
      active = null
    }

    const flush = () => {
      frame = 0
      if (!pending) return
      const { target, x, y } = pending
      pending = null

      if (active && active !== target) clearActive()
      active = target
      target.style.setProperty("--glass-pointer-x", `${x}%`)
      target.style.setProperty("--glass-pointer-y", `${y}%`)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!finePointer.matches || reducedMotion.matches) return

      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(".glass-sheen")
          : null

      if (!target) {
        if (active && !pending) clearActive()
        return
      }

      const bounds = target.getBoundingClientRect()
      if (bounds.width === 0 || bounds.height === 0) return

      pending = {
        target,
        x: ((event.clientX - bounds.left) / bounds.width) * 100,
        y: ((event.clientY - bounds.top) / bounds.height) * 100,
      }

      if (frame === 0) frame = window.requestAnimationFrame(flush)
    }

    document.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    })

    return () => {
      document.removeEventListener("pointermove", handlePointerMove)
      if (frame !== 0) window.cancelAnimationFrame(frame)
      pending = null
      clearActive()
    }
  }, [])

  return null
}
