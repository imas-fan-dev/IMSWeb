import { useEffect, useRef, useState } from "react"

/**
 * Which side of a `.card-field-scroll` box still hides content.
 *
 * The fade is driven from measurements instead of CSS alone: the mask has to
 * disappear once the reader reaches the end, and only the side that still has
 * content below/above keeps it.
 */
export type CardFieldFade = "none" | "top" | "bottom" | "both"

export function cardFieldFade(node: HTMLElement): CardFieldFade {
  const overflowing = node.scrollHeight - node.clientHeight > 1
  if (!overflowing) return "none"
  const atTop = node.scrollTop <= 1
  const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1
  if (atTop && atBottom) return "none"
  if (atTop) return "bottom"
  if (atBottom) return "top"
  return "both"
}

/**
 * Attaches the measurement to a scroll box and returns the fade state to put
 * on `data-fade`. Re-measures when `content` changes, on resize and on scroll.
 * A native scroll listener is used because scroll events do not bubble through
 * the React root.
 */
export function useCardFieldFade(content: unknown) {
  const ref = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState<CardFieldFade>("none")
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => setFade(cardFieldFade(node))
    measure()
    node.addEventListener("scroll", measure, { passive: true })
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    observer?.observe(node)
    return () => {
      node.removeEventListener("scroll", measure)
      observer?.disconnect()
    }
  }, [content])
  return { ref, fade }
}
