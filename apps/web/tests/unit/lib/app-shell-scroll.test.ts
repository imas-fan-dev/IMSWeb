import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  beginAppScrollRestoration,
  isNonScrollingAppRoute,
  normalizeAppPathname,
} from "~/lib/app-shell-scroll"

describe("App window restoration", () => {
  let height: number
  let position: number
  let resize: ResizeObserverCallback
  let disconnect: ReturnType<typeof vi.fn>
  let scrollTo: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    height = 900
    position = 0
    vi.spyOn(
      document.documentElement,
      "scrollHeight",
      "get"
    ).mockImplementation(() => height)
    vi.spyOn(document.body, "scrollHeight", "get").mockImplementation(
      () => height
    )
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800)
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => position)
    scrollTo = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(
        (optionsOrX?: ScrollToOptions | number, y?: number) => {
          position =
            typeof optionsOrX === "number"
              ? (y ?? 0)
              : (optionsOrX?.top ?? position)
        }
      )
    disconnect = vi.fn()
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback
        }
        observe() {}
        disconnect = disconnect
      }
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function grow(nextHeight: number) {
    height = nextHeight
    resize([], {} as ResizeObserver)
    vi.advanceTimersByTime(20)
  }

  it("restores delayed content and releases its observer at the bounded end", () => {
    const done = vi.fn()
    beginAppScrollRestoration(1200, { onFinish: done })
    vi.advanceTimersByTime(20)
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 100, behavior: "instant" })
    expect(done).not.toHaveBeenCalled()
    grow(2400)
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: 1200,
      behavior: "instant",
    })
    expect(done).not.toHaveBeenCalled()
    expect(disconnect).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5000)
    expect(done).toHaveBeenCalledExactlyOnceWith("success")
    expect(disconnect).toHaveBeenCalledOnce()
    const count = scrollTo.mock.calls.length
    grow(3200)
    vi.advanceTimersByTime(2100)
    expect(scrollTo).toHaveBeenCalledTimes(count)
  })

  it("holds the requested position through later content growth and anchoring", () => {
    const done = vi.fn()
    beginAppScrollRestoration(1200, { onFinish: done })
    grow(2400)
    expect(position).toBe(1200)
    vi.advanceTimersByTime(2500)
    position = 1288
    grow(2488)
    expect(position).toBe(1200)
    position = 1244
    window.dispatchEvent(new Event("scroll"))
    vi.advanceTimersByTime(20)
    expect(position).toBe(1200)
    vi.advanceTimersByTime(5000)
    expect(done).toHaveBeenCalledExactlyOnceWith("success")
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it.each(["wheel", "touchmove", "keydown"])(
    "lets %s input cancel a pending restore",
    (event) => {
      const done = vi.fn()
      beginAppScrollRestoration(1200, { onFinish: done })
      vi.advanceTimersByTime(20)
      window.dispatchEvent(
        event === "keydown"
          ? new KeyboardEvent(event, { key: "PageDown" })
          : new Event(event)
      )
      const count = scrollTo.mock.calls.length
      grow(3000)
      vi.advanceTimersByTime(2100)
      expect(scrollTo).toHaveBeenCalledTimes(count)
      expect(done).toHaveBeenCalledExactlyOnceWith("cancelled")
      expect(disconnect).toHaveBeenCalledOnce()
    }
  )

  it("does not treat programmatic scroll or unrelated keys as user scrolling", () => {
    const done = vi.fn()
    beginAppScrollRestoration(1200, { onFinish: done })
    window.dispatchEvent(new Event("scroll"))
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }))
    const handledKey = new KeyboardEvent("keydown", {
      key: "PageDown",
      cancelable: true,
    })
    handledKey.preventDefault()
    window.dispatchEvent(handledKey)
    grow(2400)
    expect(done).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5000)
    expect(done).toHaveBeenCalledExactlyOnceWith("success")
  })

  it.each(["pointerdown", "click", "keydown"])(
    "lets %s take ownership after the first successful position",
    (event) => {
      const done = vi.fn()
      beginAppScrollRestoration(1200, { onFinish: done })
      grow(2400)
      window.dispatchEvent(
        event === "keydown"
          ? new KeyboardEvent(event, { key: "Tab" })
          : new Event(event)
      )
      vi.advanceTimersByTime(0)
      const count = scrollTo.mock.calls.length
      grow(3200)
      vi.advanceTimersByTime(5000)
      expect(scrollTo).toHaveBeenCalledTimes(count)
      expect(done).toHaveBeenCalledExactlyOnceWith("cancelled")
    }
  )

  it.each(["pointer", "space"])(
    "lets %s activation consume the old position without cancelling its replacement",
    (input) => {
      const oldDone = vi.fn()
      const nextDone = vi.fn()
      const cancelOld = beginAppScrollRestoration(1200, { onFinish: oldDone })
      grow(2400)
      position = 1244
      window.dispatchEvent(new Event("scroll"))
      const button = document.createElement("button")
      document.body.append(button)
      let cancelNext = () => {}
      button.addEventListener("click", () => {
        expect(oldDone).not.toHaveBeenCalled()
        cancelOld()
        cancelNext = beginAppScrollRestoration(600, { onFinish: nextDone })
      })
      try {
        button.dispatchEvent(
          input === "space"
            ? new KeyboardEvent("keydown", { key: " ", bubbles: true })
            : new Event("pointerdown", { bubbles: true })
        )
        button.dispatchEvent(new Event("click", { bubbles: true }))
        vi.advanceTimersByTime(0)
        expect(oldDone).toHaveBeenCalledExactlyOnceWith("cancelled")
        expect(nextDone).not.toHaveBeenCalled()
        grow(2400)
        expect(position).toBe(600)
        expect(nextDone).not.toHaveBeenCalled()
      } finally {
        cancelNext()
        button.remove()
      }
    }
  )

  it("finishes a root position immediately", () => {
    const done = vi.fn()
    beginAppScrollRestoration(0, { onFinish: done })
    vi.advanceTimersByTime(20)
    expect(done).toHaveBeenCalledExactlyOnceWith("success")
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it("bounds a shortened or error document and stops at the deadline", () => {
    const done = vi.fn()
    beginAppScrollRestoration(1200, { deadlineMs: 100, onFinish: done })
    vi.advanceTimersByTime(100)
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 100, behavior: "instant" })
    expect(done).toHaveBeenCalledExactlyOnceWith("deadline")
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it("cancels queued frames on replacement or unmount", () => {
    const done = vi.fn()
    const cancel = beginAppScrollRestoration(1200, { onFinish: done })
    cancel()
    cancel()
    grow(3000)
    vi.advanceTimersByTime(2100)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(done).toHaveBeenCalledExactlyOnceWith("cancelled")
  })

  it("handles missing ResizeObserver at the bounded final attempt", () => {
    vi.stubGlobal("ResizeObserver", undefined)
    const done = vi.fn()
    beginAppScrollRestoration(1200, { deadlineMs: 100, onFinish: done })
    vi.advanceTimersByTime(20)
    height = 3000
    vi.advanceTimersByTime(80)
    expect(scrollTo).toHaveBeenLastCalledWith({
      top: 1200,
      behavior: "instant",
    })
    expect(done).toHaveBeenCalledExactlyOnceWith("success")
  })

  it("excludes only the full-screen map and normalizes trailing slashes", () => {
    expect(isNonScrollingAppRoute("/community/exchange/")).toBe(true)
    expect(isNonScrollingAppRoute("/community/exchange/offices/tokyo")).toBe(
      false
    )
    expect(normalizeAppPathname("/wiki//")).toBe("/wiki")
    expect(normalizeAppPathname("/")).toBe("/")
  })
})
