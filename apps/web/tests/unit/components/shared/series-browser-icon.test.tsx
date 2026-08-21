import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SeriesBrowserIcon } from "~/components/shared/series-browser-icon"

const sendWikiCatalog = vi.fn()

vi.mock("~/lib/api", () => ({
  getWikiCatalog: () => ({ send: sendWikiCatalog }),
}))

const agencyIcons = [
  { id: 1, iconUrl: "/icon/agencies/765pro.webp" },
  { id: 2, iconUrl: "/icon/agencies/876pro.webp" },
  { id: 3, iconUrl: "/icon/agencies/cinderella-girls.webp" },
  { id: 4, iconUrl: "/icon/agencies/million-live.webp" },
  { id: 5, iconUrl: "/icon/agencies/sidem.webp" },
  { id: 6, iconUrl: "/icon/agencies/shiny-colors.webp" },
  { id: 7, iconUrl: "/icon/agencies/gakuen.webp" },
]

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
    sendWikiCatalog.mockResolvedValue({ agencies: agencyIcons })
  })

  afterEach(() => {
    document.querySelectorAll('link[rel~="icon"]').forEach((icon) => {
      icon.remove()
    })
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("selects from every icon in the agency catalog", async () => {
    const icon = addDefaultIcon()
    const random = vi.spyOn(Math, "random")
    stubReducedMotion(true)

    for (const [index, agency] of agencyIcons.entries()) {
      random.mockReturnValue((index + 0.5) / agencyIcons.length)
      const { unmount } = render(<SeriesBrowserIcon />)
      await act(async () => undefined)

      expect(icon.getAttribute("href")).toBe(agency.iconUrl)
      expect(icon.getAttribute("href")).not.toContain("/brand/series/wall/")

      unmount()
      expect(icon.getAttribute("href")).toBe("/favicon.ico")
      expect(icon.getAttribute("type")).toBe("image/x-icon")
    }
  })

  it("cycles globally without changing a child route title", async () => {
    const icon = addDefaultIcon()
    document.title = "活动中心 | IMSWeb"
    stubReducedMotion(false)
    vi.spyOn(Math, "random").mockReturnValue(0)

    const { unmount } = render(<SeriesBrowserIcon />)
    await act(async () => undefined)

    expect(icon.getAttribute("href")).toBe(agencyIcons[0].iconUrl)
    act(() => vi.advanceTimersByTime(10_000))
    expect(icon.getAttribute("href")).toBe(agencyIcons[1].iconUrl)
    expect(document.title).toBe("活动中心 | IMSWeb")

    unmount()
  })

  it("keeps the original favicon when the catalog is unavailable", async () => {
    const icon = addDefaultIcon()
    stubReducedMotion(false)
    sendWikiCatalog.mockRejectedValueOnce(new Error("catalog unavailable"))

    const { unmount } = render(<SeriesBrowserIcon />)
    await act(async () => undefined)

    expect(icon.getAttribute("href")).toBe("/favicon.ico")
    expect(icon.getAttribute("type")).toBe("image/x-icon")

    act(() => vi.advanceTimersByTime(10_000))
    expect(icon.getAttribute("href")).toBe("/favicon.ico")
    unmount()
  })
})
