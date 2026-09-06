import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Namecard } from "~/lib/api"
import { useNamecardMasonry } from "~/pages/community/hooks/use-namecard-masonry"

const cards = [1, 2, 3, 4].map((id) => ({ id }) as Namecard)

function Gallery({ list = cards }: { list?: Namecard[] }) {
  const ref = useNamecardMasonry(list)
  return (
    <div ref={ref} data-testid="gallery">
      {list.map((card) => (
        <div key={card.id} data-namecard-item data-testid={`item-${card.id}`} />
      ))}
    </div>
  )
}

describe("useNamecardMasonry", () => {
  let notify: () => void
  let resize: () => void
  let heights: number[]
  let desktop: boolean
  const observe = vi.fn()
  const disconnect = vi.fn()
  const removeEventListener = vi.fn()
  const frames = new Map<number, FrameRequestCallback>()
  let frameId: number

  function flush() {
    act(() => {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((callback) => callback(0))
    })
  }

  function placements(list = cards) {
    return list.map((card) => {
      const { style } = screen.getByTestId(`item-${card.id}`)
      return ["--namecard-start", "--namecard-end", "--namecard-column"].map(
        (property) => style.getPropertyValue(property)
      )
    })
  }

  function tracks() {
    const rows = screen
      .getByTestId("gallery")
      .style.getPropertyValue("--namecard-rows")
    return rows ? rows.split(" ").map(parseFloat) : []
  }

  function expectCoordinates(list = cards) {
    const boundaries = [0]
    for (const track of tracks()) {
      expect(track).toBeGreaterThan(0)
      boundaries.push(boundaries.at(-1)! + track)
    }
    const bottom = [0, 0]
    placements(list).forEach(([start, end, column], index) => {
      expect(column).toBe(String((index % 2) + 1))
      expect(boundaries[Number(start) - 1]).toBeCloseTo(bottom[index % 2])
      const expectedEnd = bottom[index % 2] + heights[list[index].id - 1]
      expect(boundaries[Number(end) - 1]).toBeCloseTo(expectedEnd)
      bottom[index % 2] = expectedEnd + 12
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    heights = [100.2, 180, 90, 120]
    desktop = false
    frameId = 0
    frames.clear()
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notify = callback
        }
        observe = observe
        disconnect = disconnect
      }
    )
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        get matches() {
          return desktop
        },
        addEventListener: (_: string, callback: () => void) => {
          resize = callback
        },
        removeEventListener,
      }))
    )
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frames.set(++frameId, callback)
        return frameId
      })
    )
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((id: number) => frames.delete(id))
    )
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const id = Number(this.dataset.testid?.replace("item-", ""))
        return { height: heights[id - 1] ?? 0 } as DOMRect
      }
    )
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("measures initial natural heights with a 12px gap and parity columns before enabling", () => {
    render(<Gallery />)
    expect(placements()).toEqual([
      ["1", "2", "1"],
      ["1", "4", "2"],
      ["3", "6", "1"],
      ["5", "7", "2"],
    ])
    expect(tracks()).toHaveLength(6)
    expectCoordinates()
    expect(screen.getByTestId("gallery")).toHaveAttribute(
      "data-masonry",
      "ready"
    )
    expect(observe).toHaveBeenCalledTimes(4)
  })

  it("batches height growth and shrinkage and avoids unchanged style writes", () => {
    render(<Gallery />)
    const write = vi.spyOn(screen.getByTestId("item-1").style, "setProperty")
    heights[1] = 260.5
    notify()
    notify()
    expect(frames.size).toBe(1)
    flush()
    expectCoordinates()
    expect(write).not.toHaveBeenCalled()
    heights[1] = 80
    notify()
    flush()
    expectCoordinates()
    const galleryWrite = vi.spyOn(
      screen.getByTestId("gallery").style,
      "setProperty"
    )
    write.mockClear()
    notify()
    flush()
    expect(write).not.toHaveBeenCalled()
    expect(galleryWrite).not.toHaveBeenCalled()
  })

  it("skips desktop measurements and clears measured properties across the breakpoint", () => {
    desktop = true
    render(<Gallery />)
    expect(HTMLElement.prototype.getBoundingClientRect).not.toHaveBeenCalled()
    expect(screen.getByTestId("gallery")).not.toHaveAttribute("data-masonry")
    desktop = false
    resize()
    flush()
    expectCoordinates()
    desktop = true
    resize()
    flush()
    expect(placements()).toEqual(cards.map(() => ["", "", ""]))
    expect(tracks()).toEqual([])
    expect(screen.getByTestId("gallery")).not.toHaveAttribute("data-masonry")
  })

  it("disconnects and invalidates pending and late callbacks on cleanup", () => {
    const { unmount } = render(<Gallery />)
    const gallery = screen.getByTestId("gallery")
    const item = screen.getByTestId("item-1")
    notify()
    const pending = [...frames.values()][0]
    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(removeEventListener).toHaveBeenCalledWith("change", resize)
    expect(frames.size).toBe(0)
    pending(0)
    notify()
    expect(frames.size).toBe(0)
    expect(gallery).not.toHaveAttribute("data-masonry")
    expect(gallery.style.getPropertyValue("--namecard-rows")).toBe("")
    expect(item.style.cssText).toBe("")
  })

  it("re-observes changed card lists and ignores the previous observer", () => {
    const { rerender } = render(<Gallery />)
    const previous = notify
    rerender(<Gallery list={[cards[3], cards[0]]} />)
    expect(disconnect).toHaveBeenCalledOnce()
    expect(
      screen.getByTestId("item-4").style.getPropertyValue("--namecard-column")
    ).toBe("1")
    expect(
      screen.getByTestId("item-1").style.getPropertyValue("--namecard-column")
    ).toBe("2")
    expectCoordinates([cards[3], cards[0]])
    previous()
    expect(frames.size).toBe(0)
  })

  it("leaves the ordinary grid untouched without ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined)
    render(<Gallery />)
    expect(screen.getByTestId("gallery")).not.toHaveAttribute("data-masonry")
    expect(placements()).toEqual(cards.map(() => ["", "", ""]))
    expect(tracks()).toEqual([])
    expect(HTMLElement.prototype.getBoundingClientRect).not.toHaveBeenCalled()
  })

  it.each([0, -1, NaN, Infinity])(
    "falls back for invalid height %s and recovers",
    (height) => {
      heights[1] = height
      render(<Gallery />)
      expect(screen.getByTestId("gallery")).not.toHaveAttribute("data-masonry")
      expect(placements()).toEqual(cards.map(() => ["", "", ""]))
      expect(tracks()).toEqual([])
      heights[1] = 180
      notify()
      flush()
      expectCoordinates()
      expect(screen.getByTestId("gallery")).toHaveAttribute(
        "data-masonry",
        "ready"
      )
      heights[1] = height
      notify()
      flush()
      expect(screen.getByTestId("gallery")).not.toHaveAttribute("data-masonry")
      expect(placements()).toEqual(cards.map(() => ["", "", ""]))
      expect(tracks()).toEqual([])
    }
  )

  it("bounds tracks for 48 very tall cards while preserving every height and gap", () => {
    const list = Array.from(
      { length: 48 },
      (_, index) => ({ id: index + 1 }) as Namecard
    )
    heights = list.map((_, index) => 1200.25 + index * 17)
    render(<Gallery list={list} />)
    expect(screen.getByTestId("gallery")).toHaveAttribute(
      "data-masonry",
      "ready"
    )
    expect(tracks().length).toBeLessThanOrEqual(2 * list.length - 1)
    expect(tracks().reduce((sum, track) => sum + track, 0)).toBeGreaterThan(
      10000
    )
    expectCoordinates(list)
    for (const [start, end] of placements(list)) {
      expect(Number(start)).toBeGreaterThanOrEqual(1)
      expect(Number(end)).toBeLessThanOrEqual(2 * list.length)
      expect(Number(end)).toBeGreaterThan(Number(start))
    }
  })
})
