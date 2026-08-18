import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SeriesBrowserIcon } from "~/components/shared/series-browser-icon"
import { seriesWallItems } from "~/lib/series-wall"

function addDefaultIcon() {
  const icon = document.createElement("link")
  icon.rel = "icon"
  icon.type = "image/x-icon"
  icon.href = "/favicon.ico"
  document.head.append(icon)
  return icon
}

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches }))
}

describe("SeriesBrowserIcon", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    document.querySelectorAll('link[rel~="icon"]').forEach((icon) => {
      icon.remove()
    })
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("selects from every icon in the shared series catalog", () => {
    const icon = addDefaultIcon()
    const random = vi.spyOn(Math, "random")
    stubReducedMotion(true)

    seriesWallItems.forEach((series, index) => {
      random.mockReturnValue((index + 0.5) / seriesWallItems.length)
      const { unmount } = render(<SeriesBrowserIcon />)

      expect(icon.getAttribute("href")).toBe(series.icon)

      unmount()
      expect(icon.getAttribute("href")).toBe("/favicon.ico")
      expect(icon.getAttribute("type")).toBe("image/x-icon")
    })
  })

  it("cycles globally without changing a child route title", () => {
    const icon = addDefaultIcon()
    document.title = "活动中心 | IMSWeb"
    stubReducedMotion(false)
    vi.spyOn(Math, "random").mockReturnValue(0)

    const { unmount } = render(<SeriesBrowserIcon />)

    expect(icon.getAttribute("href")).toBe("/brand/series/wall/765pro.webp")
    vi.advanceTimersByTime(10_000)
    expect(icon.getAttribute("href")).toBe("/brand/series/wall/cinderella-girls.webp")
    expect(document.title).toBe("活动中心 | IMSWeb")

    unmount()
  })
})
