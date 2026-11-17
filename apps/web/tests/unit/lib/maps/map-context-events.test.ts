import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMapContextEvents } from "~/lib/maps/map-context-events"

let container: HTMLDivElement
let dispose: () => void
const open = vi.fn()
function pointer(type: string, x = 10, y = 20, primary = true, id = 1) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  })
  Object.defineProperties(event, {
    pointerType: { value: "touch" },
    pointerId: { value: id },
    isPrimary: { value: primary },
  })
  container.dispatchEvent(event)
}
beforeEach(() => {
  vi.useFakeTimers()
  open.mockClear()
  container = document.createElement("div")
  document.body.append(container)
  dispose = createMapContextEvents(container, open)
})
afterEach(() => {
  dispose()
  container.remove()
  vi.useRealTimers()
})

describe("map background shortcuts", () => {
  it("opens at the gesture coordinate on right click, excluding controls", () => {
    container.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 42,
        clientY: 55,
      })
    )
    expect(open).toHaveBeenCalledExactlyOnceWith({ x: 42, y: 55 })
    const button = document.createElement("button")
    container.append(button)
    button.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }))
    expect(open).toHaveBeenCalledTimes(1)
  })
  it("opens once after a hold and suppresses its compatibility click and menu", () => {
    const click = vi.fn()
    container.addEventListener("click", click)
    pointer("pointerdown")
    vi.advanceTimersByTime(550)
    expect(open).toHaveBeenCalledExactlyOnceWith({ x: 10, y: 20 })
    pointer("pointerup")
    container.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    )
    container.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    )
    expect(open).toHaveBeenCalledTimes(1)
    expect(click).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1001)
    container.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(click).toHaveBeenCalledOnce()
  })
  it.each(["move", "second finger", "cancel", "release", "wheel", "dispose"])(
    "cancels a hold on %s",
    (action) => {
      pointer("pointerdown")
      if (action === "move") pointer("pointermove", 30, 20)
      if (action === "second finger") pointer("pointerdown", 10, 20, false, 2)
      if (action === "cancel") pointer("pointercancel")
      if (action === "release") pointer("pointerup")
      if (action === "wheel") container.dispatchEvent(new Event("wheel"))
      if (action === "dispose") dispose()
      vi.advanceTimersByTime(1000)
      expect(open).not.toHaveBeenCalled()
    }
  )
})
