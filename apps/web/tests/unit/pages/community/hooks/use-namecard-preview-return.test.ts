import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useNamecardPreviewReturn } from "~/pages/community/hooks/use-namecard-preview-return"

const scrollToDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollTo"
)
const frames: FrameRequestCallback[] = []
const scrollElement = vi.fn()
const scrollWindow = vi.fn()
let root: HTMLElement

function flushFrame() {
  act(() => {
    for (const callback of frames.splice(0)) callback(0)
  })
}

function setup() {
  const outer = document.createElement("div")
  const inner = document.createElement("div")
  const trigger = document.createElement("button")
  root.tabIndex = -1
  inner.append(trigger)
  outer.append(inner)
  root.append(outer)
  outer.scrollTop = 300
  outer.scrollLeft = 40
  inner.scrollTop = 125
  inner.scrollLeft = 15
  const hook = renderHook(({ context }) => useNamecardPreviewReturn(context), {
    initialProps: { context: "page=2&size=12" },
  })
  hook.result.current.fallbackRef.current = root
  const focus = vi.spyOn(trigger, "focus")
  const fallbackFocus = vi.spyOn(root, "focus")
  return { ...hook, outer, inner, trigger, focus, fallbackFocus }
}

describe("useNamecardPreviewReturn", () => {
  beforeEach(() => {
    frames.length = 0
    scrollElement.mockClear()
    scrollWindow.mockClear()
    root = document.createElement("section")
    document.body.append(root)
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollElement,
    })
    vi.stubGlobal("scrollTo", scrollWindow)
    vi.stubGlobal("scrollY", 900)
    vi.stubGlobal("scrollX", 75)
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
  })

  afterEach(() => {
    root.remove()
    vi.unstubAllGlobals()
    if (scrollToDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollTo",
        scrollToDescriptor
      )
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
    }
  })

  it("does nothing without a remembered, prepared return target", () => {
    const { result, trigger } = setup()
    result.current.restore()
    result.current.prepareRestore()
    result.current.restore()
    result.current.remember(trigger)
    result.current.restore()

    expect(frames).toHaveLength(0)
    expect(scrollWindow).not.toHaveBeenCalled()
    expect(scrollElement).not.toHaveBeenCalled()
  })

  it("delays focus and restores the saved window and nested scroll coordinates", () => {
    const { result, trigger, outer, inner, focus, fallbackFocus } = setup()
    result.current.remember(trigger)
    outer.scrollTop = 0
    outer.scrollLeft = 0
    inner.scrollTop = 0
    inner.scrollLeft = 0
    vi.stubGlobal("scrollY", 0)
    vi.stubGlobal("scrollX", 0)
    result.current.prepareRestore()
    result.current.restore()

    expect(frames).toHaveLength(1)
    expect(focus).not.toHaveBeenCalled()
    expect(scrollWindow).not.toHaveBeenCalled()
    expect(scrollElement).not.toHaveBeenCalled()

    flushFrame()

    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
    expect(trigger).toHaveFocus()
    expect(fallbackFocus).not.toHaveBeenCalled()
    const innerCall = scrollElement.mock.contexts.indexOf(inner)
    const outerCall = scrollElement.mock.contexts.indexOf(outer)
    expect(innerCall).toBeGreaterThanOrEqual(0)
    expect(outerCall).toBeGreaterThanOrEqual(0)
    expect(scrollElement.mock.calls[innerCall]).toEqual([
      { top: 125, left: 15, behavior: "instant" },
    ])
    expect(scrollElement.mock.calls[outerCall]).toEqual([
      { top: 300, left: 40, behavior: "instant" },
    ])
    expect(scrollWindow).toHaveBeenCalledExactlyOnceWith({
      top: 900,
      left: 75,
      behavior: "instant",
    })
  })

  it("restores only once when the dialog requests final focus more than once", () => {
    const { result, trigger, focus } = setup()
    result.current.remember(trigger)
    result.current.prepareRestore()
    result.current.restore()
    result.current.restore()
    flushFrame()
    result.current.restore()
    flushFrame()

    expect(focus).toHaveBeenCalledOnce()
    expect(scrollWindow).toHaveBeenCalledOnce()
  })

  it("focuses the fallback and skips disconnected ancestors when the trigger is removed", () => {
    const { result, trigger, inner, outer, focus, fallbackFocus } = setup()
    result.current.remember(trigger)
    inner.remove()
    result.current.prepareRestore()
    result.current.restore()
    flushFrame()

    expect(focus).not.toHaveBeenCalled()
    expect(fallbackFocus).toHaveBeenCalledExactlyOnceWith({
      preventScroll: true,
    })
    expect(root).toHaveFocus()
    expect(scrollElement.mock.contexts).not.toContain(inner)
    expect(scrollElement.mock.contexts).toContain(outer)
    expect(scrollWindow).toHaveBeenCalledWith({
      top: 900,
      left: 75,
      behavior: "instant",
    })
  })

  it("still restores the window if neither trigger nor fallback is available", () => {
    const { result, trigger, focus, fallbackFocus } = setup()
    result.current.remember(trigger)
    root.remove()
    result.current.fallbackRef.current = null
    result.current.prepareRestore()
    result.current.restore()

    expect(() => flushFrame()).not.toThrow()
    expect(focus).not.toHaveBeenCalled()
    expect(fallbackFocus).not.toHaveBeenCalled()
    expect(scrollWindow).toHaveBeenCalledOnce()
  })

  it("discards a queued return when another preview opens before the frame", () => {
    const { result, trigger, focus, inner } = setup()
    result.current.remember(trigger)
    result.current.prepareRestore()
    result.current.restore()
    const nextTrigger = document.createElement("button")
    inner.append(nextTrigger)
    const nextFocus = vi.spyOn(nextTrigger, "focus")
    vi.stubGlobal("scrollY", 1200)
    result.current.remember(nextTrigger)
    flushFrame()

    expect(focus).not.toHaveBeenCalled()
    expect(nextFocus).not.toHaveBeenCalled()
    expect(scrollWindow).not.toHaveBeenCalled()

    result.current.prepareRestore()
    result.current.restore()
    flushFrame()

    expect(nextFocus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
    expect(scrollWindow).toHaveBeenCalledExactlyOnceWith({
      top: 1200,
      left: 75,
      behavior: "instant",
    })
  })

  it("invalidates saved and queued targets when the list context changes", () => {
    const { result, rerender, trigger, focus } = setup()
    result.current.remember(trigger)
    result.current.prepareRestore()
    result.current.restore()
    rerender({ context: "page=3&size=24" })
    flushFrame()
    result.current.prepareRestore()
    result.current.restore()

    expect(focus).not.toHaveBeenCalled()
    expect(scrollWindow).not.toHaveBeenCalled()
    expect(frames).toHaveLength(0)
  })

  it("ignores a queued restoration after the hook unmounts", () => {
    const { result, trigger, focus, unmount } = setup()
    result.current.remember(trigger)
    result.current.prepareRestore()
    result.current.restore()
    unmount()
    flushFrame()

    expect(focus).not.toHaveBeenCalled()
    expect(scrollWindow).not.toHaveBeenCalled()
    expect(scrollElement).not.toHaveBeenCalled()
  })
})
