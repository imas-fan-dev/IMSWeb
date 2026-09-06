import { act, fireEvent, render, screen } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useNamecardPaginationVisibility } from "~/pages/community/hooks/use-namecard-pagination-visibility"

const target = vi.hoisted(() => ({ app: true }))
vi.mock("~/lib/app-target", () => ({
  get IS_APP_TARGET() {
    return target.app
  },
}))

const marker = "data-namecard-pagination-visible"
let rect: DOMRect
let observers: ObserverMock[]

class ObserverMock {
  observe = vi.fn()
  disconnect = vi.fn()

  constructor(private callback: IntersectionObserverCallback) {
    observers.push(this)
  }

  intersect(node: HTMLElement, visible: boolean, intersection = rect) {
    this.callback(
      [
        {
          target: node,
          isIntersecting: visible,
          intersectionRect: intersection,
          boundingClientRect: rect,
          intersectionRatio: visible ? 1 : 0,
          rootBounds: new DOMRect(0, 0, 390, 844),
          time: 0,
        },
      ],
      this as unknown as IntersectionObserver
    )
  }
}

function Pagination({ mounted = true, identity = "page-1" }) {
  const ref = useNamecardPaginationVisibility()
  return (
    <div data-testid="scroll-container">
      {mounted ? (
        <nav key={identity} ref={ref} aria-label="Pagination" />
      ) : null}
    </div>
  )
}

function navigation() {
  return screen.getByRole("navigation", { name: "Pagination" })
}

describe("useNamecardPaginationVisibility", () => {
  beforeEach(() => {
    target.app = true
    rect = new DOMRect(16, 644, 358, 96)
    observers = []
    vi.stubGlobal("innerHeight", 844)
    vi.stubGlobal("innerWidth", 390)
    vi.stubGlobal("IntersectionObserver", ObserverMock)
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => rect
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("measures on mount without waiting for the first observer callback", () => {
    render(<Pagination />)

    expect(navigation()).toHaveAttribute(marker)
    expect(observers).toHaveLength(1)
    expect(observers[0].observe).toHaveBeenCalledWith(navigation())
    act(() => observers[0].intersect(navigation(), false))
    expect(navigation()).not.toHaveAttribute(marker)
    act(() => observers[0].intersect(navigation(), true))
    expect(navigation()).toHaveAttribute(marker)
  })

  it("attaches when navigation mounts after loading and cleans up when the list disappears", () => {
    const { rerender } = render(<Pagination mounted={false} />)
    expect(observers).toHaveLength(0)
    rerender(<Pagination />)
    const node = navigation()
    expect(node).toHaveAttribute(marker)

    rerender(<Pagination mounted={false} />)
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
    expect(node).not.toHaveAttribute(marker)
    act(() => observers[0].intersect(node, true))
    expect(node).not.toHaveAttribute(marker)
  })

  it("ignores callbacks for replaced nodes and nodes from unrelated observers", () => {
    const { rerender } = render(<Pagination />)
    const firstNode = navigation()
    const firstObserver = observers[0]
    rect = new DOMRect(16, 900, 358, 96)
    rerender(<Pagination identity="page-2" />)
    const nextNode = navigation()
    expect(firstObserver.disconnect).toHaveBeenCalledOnce()
    expect(firstNode).not.toHaveAttribute(marker)
    expect(nextNode).not.toHaveAttribute(marker)

    act(() => firstObserver.intersect(firstNode, true))
    act(() => observers[1].intersect(firstNode, true))
    expect(firstNode).not.toHaveAttribute(marker)
    expect(nextNode).not.toHaveAttribute(marker)
    act(() => observers[1].intersect(nextNode, true))
    expect(nextNode).toHaveAttribute(marker)
  })

  it("clears the marker and ignores pending callbacks on unmount", () => {
    const { unmount } = render(<Pagination />)
    const node = navigation()
    unmount()
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
    expect(node).not.toHaveAttribute(marker)
    act(() => observers[0].intersect(node, true))
    expect(node).not.toHaveAttribute(marker)
  })

  it("stays usable through StrictMode effect cleanup", () => {
    const { unmount } = render(
      <StrictMode>
        <Pagination />
      </StrictMode>
    )
    const node = navigation()
    expect(node).toHaveAttribute(marker)
    expect(observers.at(-1)?.observe).toHaveBeenCalledWith(node)
    unmount()
    expect(node).not.toHaveAttribute(marker)
    expect(
      observers.every((observer) => observer.disconnect.mock.calls.length === 1)
    ).toBe(true)
  })

  it.each([
    [16, 844, 358, 96],
    [16, -96, 358, 96],
    [390, 644, 358, 96],
    [-358, 644, 358, 96],
    [16, 644, 0, 96],
    [16, 644, 358, 0],
  ])(
    "does not mark an offscreen or empty initial rectangle (%s, %s, %s, %s)",
    (x, y, width, height) => {
      rect = new DOMRect(x, y, width, height)
      render(<Pagination />)
      expect(navigation()).not.toHaveAttribute(marker)
    }
  )

  it("requires a positive intersection instead of just touching the viewport edge", () => {
    render(<Pagination />)
    act(() =>
      observers[0].intersect(navigation(), true, new DOMRect(16, 844, 358, 0))
    )
    expect(navigation()).not.toHaveAttribute(marker)
  })

  it("uses captured ancestor scroll and resize events without IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined)
    const removeEventListener = vi.spyOn(window, "removeEventListener")
    const { unmount } = render(<Pagination />)
    const node = navigation()
    expect(node).toHaveAttribute(marker)

    rect = new DOMRect(16, 900, 358, 96)
    fireEvent.scroll(screen.getByTestId("scroll-container"))
    expect(node).not.toHaveAttribute(marker)
    rect = new DOMRect(16, 644, 358, 96)
    fireEvent.resize(window)
    expect(node).toHaveAttribute(marker)
    rect = new DOMRect(16, -100, 358, 96)
    fireEvent.scroll(window)
    expect(node).not.toHaveAttribute(marker)

    unmount()
    expect(removeEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
      true
    )
    expect(removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function)
    )
    rect = new DOMRect(16, 644, 358, 96)
    fireEvent.resize(window)
    expect(node).not.toHaveAttribute(marker)
  })

  it("does not measure or subscribe in the Web target", () => {
    target.app = false
    const addEventListener = vi.spyOn(window, "addEventListener")
    render(<Pagination />)
    expect(navigation()).not.toHaveAttribute(marker)
    expect(observers).toHaveLength(0)
    expect(HTMLElement.prototype.getBoundingClientRect).not.toHaveBeenCalled()
    expect(addEventListener).not.toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
      true
    )
    expect(addEventListener).not.toHaveBeenCalledWith(
      "resize",
      expect.any(Function)
    )
  })
})
