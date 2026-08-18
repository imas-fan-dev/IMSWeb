import { useEffect } from "react"

import { seriesWallItems } from "~/lib/series-wall"

const cycleIntervalMs = 10_000
const seriesIcons = seriesWallItems.map((series) => series.icon)

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

export function SeriesBrowserIcon() {
  useEffect(() => {
    const existingIcon =
      document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    const icon = existingIcon ?? document.createElement("link")
    const createdIcon = existingIcon === null
    const initialIconHref = icon.getAttribute("href")
    const initialIconType = icon.getAttribute("type")
    let previousIconIndex = -1

    if (createdIcon) {
      icon.rel = "icon"
      document.head.append(icon)
    }

    const updateIcon = () => {
      previousIconIndex = nextIconIndex(previousIconIndex)
      icon.type = "image/webp"
      icon.href = seriesIcons[previousIconIndex]
    }

    updateIcon()

    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches
    const iconTimer = reducedMotion
      ? undefined
      : window.setInterval(updateIcon, cycleIntervalMs)

    return () => {
      if (iconTimer !== undefined) window.clearInterval(iconTimer)
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
