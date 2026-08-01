import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { HomeBrowserBrand } from "~/pages/home/components/home-browser-brand"

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches }))
}

describe("HomeBrowserBrand", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.title = "IMSWeb | 偶像大师交流站"
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("cycles the homepage title every ten seconds", () => {
    stubReducedMotion(false)

    const { unmount } = render(<HomeBrowserBrand />)

    expect(document.title).toBe("IMSWeb | 偶像大师交流站")

    vi.advanceTimersByTime(10_000)
    expect(document.title).toBe("偶像大师交流站")

    vi.advanceTimersByTime(10_000)
    expect(document.title).toBe("欢迎各位普罗丢瑟喵")

    unmount()
    expect(document.title).toBe("IMSWeb | 偶像大师交流站")
  })

  it("keeps the route title stable when reduced motion is preferred", () => {
    stubReducedMotion(true)

    const { unmount } = render(<HomeBrowserBrand />)

    vi.advanceTimersByTime(30_000)
    expect(document.title).toBe("IMSWeb | 偶像大师交流站")

    unmount()
  })

  it("does not overwrite a title supplied by the next route", () => {
    stubReducedMotion(false)

    const { unmount } = render(<HomeBrowserBrand />)
    vi.advanceTimersByTime(10_000)
    document.title = "活动中心 | IMSWeb"

    unmount()
    expect(document.title).toBe("活动中心 | IMSWeb")
  })
})
