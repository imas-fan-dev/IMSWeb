import { useEffect } from "react"

const cycleIntervalMs = 10_000

const homeTitles = [
  "偶像大师交流站",
  "欢迎各位普罗丢瑟喵",
  "WE ARE M@STERPIECE!",
] as const

const seriesIcons = [
  "/brand/series/765pro.png",
  "/brand/series/cinderella-girls.png",
  "/brand/series/gakuen.png",
  "/brand/series/million-live.png",
  "/brand/series/shiny-colors.png",
  "/brand/series/sidem.png",
] as const

function nextIconIndex(previousIndex: number) {
  if (previousIndex < 0) {
    return Math.floor(Math.random() * seriesIcons.length)
  }

  const candidate = Math.floor(Math.random() * (seriesIcons.length - 1))
  return candidate >= previousIndex ? candidate + 1 : candidate
}

function isSeriesIcon(href: string | null) {
  return href !== null && seriesIcons.some((icon) => href.endsWith(icon))
}

export function HomeBrowserBrand() {
  useEffect(() => {
    const existingIcon =
      document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    const icon = existingIcon ?? document.createElement("link")
    const createdIcon = existingIcon === null
    const initialIconHref = icon.getAttribute("href")
    const initialIconType = icon.getAttribute("type")
    const initialTitle = document.title
    let previousIconIndex = -1
    let titleIndex = 0

    if (createdIcon) {
      icon.rel = "icon"
      document.head.append(icon)
    }

    const updateIcon = () => {
      previousIconIndex = nextIconIndex(previousIconIndex)
      icon.type = "image/png"
      icon.href = seriesIcons[previousIconIndex]
    }

    updateIcon()

    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches
    let titleTimer: number | undefined
    let iconTimer: number | undefined

    if (!reducedMotion) {
      titleTimer = window.setInterval(() => {
        document.title = homeTitles[titleIndex]
        titleIndex = (titleIndex + 1) % homeTitles.length
      }, cycleIntervalMs)
      iconTimer = window.setInterval(updateIcon, cycleIntervalMs)
    }

    return () => {
      if (titleTimer !== undefined) window.clearInterval(titleTimer)
      if (iconTimer !== undefined) window.clearInterval(iconTimer)

      if (homeTitles.some((title) => title === document.title)) {
        document.title = initialTitle
      }

      if (!isSeriesIcon(icon.getAttribute("href"))) return

      if (createdIcon) {
        icon.remove()
        return
      }

      if (initialIconHref === null) icon.removeAttribute("href")
      else icon.setAttribute("href", initialIconHref)

      if (initialIconType === null) icon.removeAttribute("type")
      else icon.setAttribute("type", initialIconType)
    }
  }, [])

  return null
}
