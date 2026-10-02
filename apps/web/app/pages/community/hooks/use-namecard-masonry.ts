import { useLayoutEffect, useRef } from "react"

import type { Namecard } from "~/lib/api"

const ITEM_GAP = 12

export function useNamecardMasonry(cards: readonly Namecard[] | undefined) {
  const galleryRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const gallery = galleryRef.current
    if (!gallery || !cards?.length || typeof ResizeObserver === "undefined")
      return
    const element = gallery
    const desktop = window.matchMedia("(min-width: 48rem)")
    const items = Array.from(
      element.querySelectorAll<HTMLElement>(":scope > [data-namecard-item]")
    )
    let active = true
    let frame: number | undefined

    function clear() {
      delete element.dataset.masonry
      element.style.removeProperty("--namecard-rows")
      for (const item of items) {
        item.style.removeProperty("--namecard-start")
        item.style.removeProperty("--namecard-end")
        item.style.removeProperty("--namecard-column")
      }
    }

    function measure() {
      frame = undefined
      if (!active) return
      if (desktop.matches) {
        clear()
        return
      }

      // Self-start keeps mobile item boxes at their natural content height.
      const heights = items.map((item) => item.getBoundingClientRect().height)
      if (heights.some((height) => !Number.isFinite(height) || height <= 0)) {
        clear()
        return
      }

      const columnBottom = [0, 0]
      const placements = heights.map((height, index) => {
        const column = index % 2
        const start = columnBottom[column]
        const end = start + height
        columnBottom[column] = end + ITEM_GAP
        return { start, end, column: column + 1 }
      })
      // Only item boundaries become grid lines, regardless of page height.
      const boundaries = Array.from(
        new Set(placements.flatMap(({ start, end }) => [start, end]))
      ).sort((a, b) => a - b)
      const lines = new Map(
        boundaries.map((position, index) => [position, index + 1])
      )
      const rows = boundaries
        .slice(1)
        .map((position, index) => `${position - boundaries[index]}px`)
        .join(" ")
      if (element.style.getPropertyValue("--namecard-rows") !== rows)
        element.style.setProperty("--namecard-rows", rows)
      items.forEach((item, index) => {
        const placement = placements[index]
        const properties = {
          "--namecard-start": String(lines.get(placement.start)),
          "--namecard-end": String(lines.get(placement.end)),
          "--namecard-column": String(placement.column),
        }
        for (const [property, value] of Object.entries(properties)) {
          if (item.style.getPropertyValue(property) !== value)
            item.style.setProperty(property, value)
        }
      })
      element.dataset.masonry = "ready"
    }

    function schedule() {
      if (active && frame === undefined)
        frame = window.requestAnimationFrame(measure)
    }

    const observer = new ResizeObserver(schedule)
    for (const item of items) observer.observe(item)
    desktop.addEventListener("change", schedule)
    measure()

    return () => {
      active = false
      observer.disconnect()
      desktop.removeEventListener("change", schedule)
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      clear()
    }
  }, [cards])

  return galleryRef
}
