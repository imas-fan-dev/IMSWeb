import { useEffect, useRef, useState } from "react"

export const MESSAGE_PAPER_WIDTH = 242
export const MESSAGE_PAPER_MIN_HEIGHT = 160
export const MESSAGE_PAPER_MAX_HEIGHT = 560

export function measureMessagePaperHeight(element: HTMLElement): number {
  return Math.max(
    MESSAGE_PAPER_MIN_HEIGHT,
    Math.min(
      MESSAGE_PAPER_MAX_HEIGHT,
      Math.ceil(element.getBoundingClientRect().height)
    )
  )
}

export function useMessagePaperHeight(content: string) {
  const measureRef = useRef<HTMLDivElement>(null)
  const normalized = content.trim()
  const [measurement, setMeasurement] = useState({
    content: "\u0000",
    height: 277,
  })
  useEffect(() => {
    const element = measureRef.current
    if (!element) return
    let alive = true
    let fontsReady = false
    const measure = () => {
      if (alive && fontsReady)
        setMeasurement({
          content: normalized,
          height: measureMessagePaperHeight(element),
        })
    }
    let timeout: ReturnType<typeof setTimeout> | undefined
    const fallback = new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, 2000)
    })
    void Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      fallback,
    ]).then(() => {
      if (timeout) clearTimeout(timeout)
      fontsReady = true
      measure()
    })
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    observer?.observe(element)
    window.addEventListener("resize", measure)
    return () => {
      alive = false
      if (timeout) clearTimeout(timeout)
      observer?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [normalized])
  return {
    measureRef,
    height: measurement.height,
    ready: measurement.content === normalized,
  }
}

// Used by the controlled historical backfill in the same browser/font environment.
export async function measureMessageContent(content: string): Promise<number> {
  const container = document.createElement("div")
  container.className =
    "pointer-events-none fixed -left-10000 top-0 w-60.5 opacity-0"
  container.setAttribute("aria-hidden", "true")
  const paper = document.createElement("div")
  paper.className =
    "relative flex w-60.5 flex-col rounded-xs px-5.5 pt-7.75 pb-7.5"
  const copy = document.createElement("p")
  copy.className =
    "text-[15px] leading-[1.75] wrap-break-word whitespace-pre-wrap"
  copy.textContent = content.trim()
  const footer = document.createElement("div")
  footer.className =
    "mt-auto flex shrink-0 items-center justify-between gap-2 pt-3 text-[11px]"
  footer.textContent = "署名　1/1"
  paper.append(copy, footer)
  container.append(paper)
  document.body.append(container)
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 2000)
      }),
    ])
    return measureMessagePaperHeight(container)
  } finally {
    if (timeout) clearTimeout(timeout)
    container.remove()
  }
}
