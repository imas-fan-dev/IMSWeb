import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { HomeBrowserBrand } from "~/pages/home/components/home-browser-brand"

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

describe("HomeBrowserBrand", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.title = "IMSWeb | 偶像大师交流站"
  })

  afterEach(() => {
    document.querySelectorAll('link[rel~="icon"]').forEach((icon) => {
      icon.remove()
    })
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("cycles the homepage title and six-series icon every ten seconds", () => {
    const icon = addDefaultIcon()
    stubReducedMotion(false)
    vi.spyOn(Math, "random").mockReturnValue(0)

    const { unmount } = render(<HomeBrowserBrand />)

    expect(icon.getAttribute("href")).toBe("/brand/series/765pro.png")
    expect(document.title).toBe("IMSWeb | 偶像大师交流站")

    vi.advanceTimersByTime(10_000)
    expect(document.title).toBe("偶像大师交流站")
    expect(icon.getAttribute("href")).toBe("/brand/series/cinderella-girls.png")

    vi.advanceTimersByTime(10_000)
    expect(document.title).toBe("欢迎各位普罗丢瑟喵")
    expect(icon.getAttribute("href")).toBe("/brand/series/765pro.png")

    unmount()
    expect(document.title).toBe("IMSWeb | 偶像大师交流站")
    expect(icon.getAttribute("href")).toBe("/favicon.ico")
    expect(icon.getAttribute("type")).toBe("image/x-icon")
  })

  it("keeps the route title stable when reduced motion is preferred", () => {
    const icon = addDefaultIcon()
    stubReducedMotion(true)
    vi.spyOn(Math, "random").mockReturnValue(0)

    const { unmount } = render(<HomeBrowserBrand />)

    vi.advanceTimersByTime(30_000)
    expect(document.title).toBe("IMSWeb | 偶像大师交流站")
    expect(icon.getAttribute("href")).toBe("/brand/series/765pro.png")

    unmount()
  })

  it("does not overwrite a title supplied by the next route", () => {
    addDefaultIcon()
    stubReducedMotion(false)
    vi.spyOn(Math, "random").mockReturnValue(0)

    const { unmount } = render(<HomeBrowserBrand />)
    vi.advanceTimersByTime(10_000)
    document.title = "活动中心 | IMSWeb"

    unmount()
    expect(document.title).toBe("活动中心 | IMSWeb")
  })
})
