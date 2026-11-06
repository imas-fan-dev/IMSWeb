import { useEffect } from "react"

import { getWikiCatalog } from "~/lib/api"

const cycleIntervalMs = 10_000

function nextIconIndex(previousIndex: number, iconCount: number) {
  if (iconCount <= 1) return 0
  if (previousIndex < 0) {
    return Math.floor(Math.random() * iconCount)
  }

  const candidate = Math.floor(Math.random() * (iconCount - 1))
  return candidate >= previousIndex ? candidate + 1 : candidate
}

export function SeriesBrowserIcon() {
  useEffect(() => {
    const existingIcon =
      document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    const icon = existingIcon ?? document.createElement("link")
    const createdIcon = existingIcon === null
    const initialIconHref = icon.getAttribute("href")
    const initialIconType = icon.getAttribute("type")
    let active = true
    let iconTimer: number | undefined
    let managedIconHref: string | null = null
    let previousIconIndex = -1

    void getWikiCatalog()
      .send()
      .then((catalog) => {
        if (!active) return

        const seriesIcons = catalog.agencies.flatMap((agency) =>
          agency.iconUrl ? [agency.iconUrl] : []
        )
        if (seriesIcons.length === 0) return

        if (createdIcon) {
          icon.rel = "icon"
          document.head.append(icon)
        }

        const updateIcon = () => {
          previousIconIndex = nextIconIndex(
            previousIconIndex,
            seriesIcons.length
          )
          managedIconHref = seriesIcons[previousIconIndex]
          icon.type = "image/webp"
          icon.href = managedIconHref
        }

        updateIcon()

        const reducedMotion = window.matchMedia?.(
          "(prefers-reduced-motion: reduce)"
        ).matches
        if (!reducedMotion && seriesIcons.length > 1) {
          iconTimer = window.setInterval(updateIcon, cycleIntervalMs)
        }
      })
      .catch(() => undefined)

    return () => {
      active = false
      if (iconTimer !== undefined) window.clearInterval(iconTimer)
      if (
        managedIconHref === null ||
        icon.getAttribute("href") !== managedIconHref
      ) {
        return
      }

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
