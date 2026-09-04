import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AppColdStartMask } from "~/components/app/app-cold-start-mask"

describe("AppColdStartMask", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("dismisses after the first painted frame", () => {
    let paint: FrameRequestCallback | undefined
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      paint = callback
      return 1
    })
    vi.spyOn(window, "cancelAnimationFrame")

    const { container } = render(<AppColdStartMask />)
    const mask = container.querySelector("[data-app-cold-start-mask]")

    expect(mask).not.toHaveAttribute("data-dismissed")
    act(() => paint?.(0))
    expect(mask).toHaveAttribute("data-dismissed", "true")
  })

  it("releases the mask when iOS defers the first frame", () => {
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1)
    vi.spyOn(window, "cancelAnimationFrame")

    const { container } = render(<AppColdStartMask />)
    const mask = container.querySelector("[data-app-cold-start-mask]")

    act(() => vi.advanceTimersByTime(249))
    expect(mask).not.toHaveAttribute("data-dismissed")

    act(() => vi.advanceTimersByTime(1))
    expect(mask).toHaveAttribute("data-dismissed", "true")
  })
})
