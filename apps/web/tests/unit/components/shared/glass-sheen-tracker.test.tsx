import { act, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GlassSheenTracker } from "~/components/shared/glass-sheen-tracker"

type PointerInit = {
  button?: number
  clientX: number
  clientY: number
  isPrimary?: boolean
  pointerId: number
}

type RectInit = {
  height: number
  left: number
  top: number
  width: number
}

function mediaQueryList(matches: boolean): MediaQueryList {
  return {
    matches,
    media: "",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
}

function mockMedia({ fine = true, reduced = false } = {}) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      if (query === "(pointer: fine)") return mediaQueryList(fine)
      if (query === "(prefers-reduced-motion: reduce)") {
        return mediaQueryList(reduced)
      }
      return mediaQueryList(false)
    })
  )
}

function mockRect(
  element: HTMLElement,
  { height, left, top, width }: RectInit
) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: left ?? 0,
    y: top ?? 0,
    left: left ?? 0,
    top: top ?? 0,
    right: (left ?? 0) + (width ?? 0),
    bottom: (top ?? 0) + (height ?? 0),
    width: width ?? 0,
    height: height ?? 0,
    toJSON: () => ({}),
  })
}

function dispatchPointer(
  target: Document | Element,
  type: string,
  { button = 0, clientX, clientY, isPrimary = true, pointerId }: PointerInit
) {
  const event = new Event(type, { bubbles: true })
  Object.defineProperties(event, {
    button: { value: button },
    clientX: { value: clientX },
    clientY: { value: clientY },
    isPrimary: { value: isPrimary },
    pointerId: { value: pointerId },
  })
  fireEvent(target, event)
}

function dispatchAnimationEnd(
  target: Document | Element,
  animationName: string
) {
  const event = new Event("animationend", { bubbles: true })
  Object.defineProperty(event, "animationName", { value: animationName })
  fireEvent(target, event)
}

function dispatchTransitionEnd(
  target: Document | Element,
  propertyName: string
) {
  const event = new Event("transitionend", { bubbles: true })
  Object.defineProperty(event, "propertyName", { value: propertyName })
  fireEvent(target, event)
}

describe("GlassSheenTracker", () => {
  const animationFrames: FrameRequestCallback[] = []

  afterEach(() => {
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    animationFrames.length = 0
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback)
      return animationFrames.length
    })
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {})
  })

  function flushAnimationFrame() {
    act(() => {
      for (const callback of animationFrames.splice(0)) callback(0)
    })
  }

  it("keeps a passive outer glass layer still while an inner control flexes", () => {
    mockMedia()
    render(<GlassSheenTracker />)

    const outerHeader = document.createElement("header")
    outerHeader.className = "glass-sheen"
    const interactiveSurface = document.createElement("div")
    interactiveSurface.className = "glass-sheen"
    interactiveSurface.dataset.glassInteractive = ""
    const tab = document.createElement("button")
    tab.className = "glass-tab"
    interactiveSurface.append(tab)
    outerHeader.append(interactiveSurface)
    document.body.append(outerHeader)

    mockRect(interactiveSurface, { left: 20, top: 10, width: 200, height: 48 })
    mockRect(tab, { left: 20, top: 10, width: 50, height: 48 })

    dispatchPointer(tab, "pointerdown", {
      pointerId: 7,
      clientX: 60,
      clientY: 30,
    })

    expect(outerHeader).not.toHaveAttribute("data-glass-pressed")
    expect(outerHeader.style.getPropertyValue("--glass-pointer-x")).toBe("")
    expect(interactiveSurface).toHaveAttribute("data-glass-pressed")
    expect(tab).toHaveAttribute("data-glass-pressed")
    expect(tab.style.getPropertyValue("--glass-press-scale-y")).toBe("0.9400")

    dispatchPointer(document, "pointermove", {
      pointerId: 7,
      clientX: 95,
      clientY: 34,
    })
    flushAnimationFrame()

    expect(tab.style.getPropertyValue("--glass-press-offset-x")).toBe("4.05px")
    expect(
      Number(tab.style.getPropertyValue("--glass-press-scale-x"))
    ).toBeGreaterThan(0.975)

    dispatchPointer(document, "pointerup", {
      pointerId: 7,
      clientX: 95,
      clientY: 34,
    })

    expect(interactiveSurface).not.toHaveAttribute("data-glass-pressed")
    expect(tab).not.toHaveAttribute("data-glass-pressed")
    expect(tab).toHaveAttribute("data-glass-releasing")

    dispatchAnimationEnd(tab, "glass-control-release")

    expect(tab).not.toHaveAttribute("data-glass-releasing")
    expect(tab.style.getPropertyValue("--glass-press-offset-x")).toBe("")
  })

  it("ignores tabs inside glass surfaces that are not explicitly interactive", () => {
    mockMedia()
    render(<GlassSheenTracker />)

    const passiveSurface = document.createElement("div")
    passiveSurface.className = "glass-sheen"
    const tab = document.createElement("button")
    tab.className = "glass-tab"
    passiveSurface.append(tab)
    document.body.append(passiveSurface)

    mockRect(passiveSurface, { left: 0, top: 0, width: 240, height: 56 })
    mockRect(tab, { left: 0, top: 0, width: 60, height: 56 })

    dispatchPointer(tab, "pointerdown", {
      pointerId: 3,
      clientX: 30,
      clientY: 28,
    })

    expect(passiveSurface).not.toHaveAttribute("data-glass-pressed")
    expect(tab).not.toHaveAttribute("data-glass-pressed")
    expect(tab.style.getPropertyValue("--glass-press-scale-x")).toBe("")
  })

  it("cancels mobile feedback as soon as the pointer leaves the surface", () => {
    mockMedia({ fine: false })
    render(<GlassSheenTracker />)

    const interactiveSurface = document.createElement("div")
    interactiveSurface.className = "glass-sheen"
    interactiveSurface.dataset.glassInteractive = ""
    const tab = document.createElement("button")
    tab.className = "glass-tab"
    interactiveSurface.append(tab)
    document.body.append(interactiveSurface)

    mockRect(interactiveSurface, { left: 0, top: 0, width: 200, height: 50 })
    mockRect(tab, { left: 0, top: 0, width: 50, height: 50 })

    dispatchPointer(tab, "pointerdown", {
      pointerId: 9,
      clientX: 25,
      clientY: 25,
    })
    dispatchPointer(document, "pointermove", {
      pointerId: 9,
      clientX: 201,
      clientY: 25,
    })

    expect(interactiveSurface).not.toHaveAttribute("data-glass-pressed")
    expect(interactiveSurface).toHaveAttribute("data-glass-exiting")
    expect(interactiveSurface.style.getPropertyValue("--glass-pointer-x")).toBe(
      "100%"
    )
    expect(interactiveSurface.style.getPropertyValue("--glass-pointer-y")).toBe(
      "50%"
    )
    expect(tab).not.toHaveAttribute("data-glass-pressed")
    expect(tab).not.toHaveAttribute("data-glass-releasing")
    expect(tab.style.getPropertyValue("--glass-press-scale-x")).toBe("")

    dispatchAnimationEnd(interactiveSurface, "glass-touch-exit")

    expect(interactiveSurface).not.toHaveAttribute("data-glass-exiting")
    expect(interactiveSurface.style.getPropertyValue("--glass-pointer-x")).toBe(
      ""
    )
  })

  it("projects a diagonal exit onto the crossed edge", () => {
    mockMedia({ fine: false })
    render(<GlassSheenTracker />)

    const interactiveSurface = document.createElement("div")
    interactiveSurface.className = "glass-sheen"
    interactiveSurface.dataset.glassInteractive = ""
    const tab = document.createElement("button")
    tab.className = "glass-tab"
    interactiveSurface.append(tab)
    document.body.append(interactiveSurface)

    mockRect(interactiveSurface, { left: 0, top: 0, width: 200, height: 100 })
    mockRect(tab, { left: 0, top: 0, width: 200, height: 100 })

    dispatchPointer(tab, "pointerdown", {
      pointerId: 12,
      clientX: 100,
      clientY: 50,
    })
    dispatchPointer(document, "pointermove", {
      pointerId: 12,
      clientX: 250,
      clientY: -100,
    })

    expect(interactiveSurface).toHaveAttribute("data-glass-exiting")
    expect(interactiveSurface.style.getPropertyValue("--glass-pointer-x")).toBe(
      "75%"
    )
    expect(interactiveSurface.style.getPropertyValue("--glass-pointer-y")).toBe(
      "0%"
    )
  })

  it("supports coarse-pointer presses on explicit glass controls", () => {
    mockMedia({ fine: false })
    render(<GlassSheenTracker />)

    const control = document.createElement("button")
    control.className = "glass-control"
    document.body.append(control)
    mockRect(control, { left: 0, top: 0, width: 120, height: 44 })

    dispatchPointer(control, "pointerdown", {
      pointerId: 11,
      clientX: 24,
      clientY: 22,
    })

    expect(control).toHaveAttribute("data-glass-pressed")
    expect(control.style.getPropertyValue("--glass-pointer-x")).toBe("20%")

    dispatchPointer(document, "pointerup", {
      pointerId: 11,
      clientX: 24,
      clientY: 22,
    })
    expect(control).toHaveAttribute("data-glass-releasing")

    dispatchTransitionEnd(control, "opacity")
    expect(control).toHaveAttribute("data-glass-releasing")

    dispatchAnimationEnd(control, "glass-control-release")
    expect(control).not.toHaveAttribute("data-glass-releasing")
  })

  it("does not add press motion when reduced motion is requested", () => {
    mockMedia({ reduced: true })
    render(<GlassSheenTracker />)

    const control = document.createElement("button")
    control.className = "glass-control"
    document.body.append(control)
    mockRect(control, { left: 0, top: 0, width: 120, height: 44 })

    dispatchPointer(control, "pointerdown", {
      pointerId: 2,
      clientX: 60,
      clientY: 22,
    })

    expect(control).not.toHaveAttribute("data-glass-pressed")
    expect(control.style.getPropertyValue("--glass-pointer-x")).toBe("")
  })
})
