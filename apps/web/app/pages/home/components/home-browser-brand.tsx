import { useEffect } from "react"

const cycleIntervalMs = 10_000

const homeTitles = [
  "偶像大师交流站",
  "欢迎各位普罗丢瑟喵",
  "WE ARE M@STERPIECE!",
] as const

export function HomeBrowserBrand() {
  useEffect(() => {
    const initialTitle = document.title
    let titleIndex = 0

    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches
    let titleTimer: number | undefined

    if (!reducedMotion) {
      titleTimer = window.setInterval(() => {
        document.title = homeTitles[titleIndex]
        titleIndex = (titleIndex + 1) % homeTitles.length
      }, cycleIntervalMs)
    }

    return () => {
      if (titleTimer !== undefined) window.clearInterval(titleTimer)

      if (homeTitles.some((title) => title === document.title)) {
        document.title = initialTitle
      }
    }
  }, [])

  return null
}
