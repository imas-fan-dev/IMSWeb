import { expect, it } from "vitest"
import { createMapPickingEvents } from "~/lib/maps/map-picking-events"

function click(element: HTMLElement) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true })
  element.dispatchEvent(event)
  return event
}

it("ignores the drag's compatibility click but accepts the next physical map click", () => {
  const container = document.createElement("div")
  const canvas = document.createElement("canvas")
  container.append(canvas)
  const events = createMapPickingEvents(container)
  canvas.dispatchEvent(new Event("pointerdown", { bubbles: true }))
  expect(events.shouldPick(click(canvas))).toBe(true)
  events.startDrag()
  expect(events.shouldPick(click(canvas))).toBe(false)
  events.endDrag()
  expect(events.shouldPick(click(canvas))).toBe(false)
  canvas.dispatchEvent(new Event("pointerdown", { bubbles: true }))
  expect(events.shouldPick(click(canvas))).toBe(true)
  events.dispose()
  expect(events.shouldPick(click(canvas))).toBe(false)
})

it.each(["button", "a", "input", "select", "textarea"])(
  "does not select a position from a %s control",
  (tag) => {
    const container = document.createElement("div")
    const element = document.createElement(tag)
    container.append(element)
    const events = createMapPickingEvents(container)
    expect(events.shouldPick(click(element))).toBe(false)
    events.dispose()
  }
)

it.each([
  "mapboxgl-marker",
  "maplibregl-marker",
  "amap-marker",
  "mapboxgl-ctrl",
  "maplibregl-ctrl",
])("ignores clicks on %s descendants", (className) => {
  const container = document.createElement("div")
  const marker = document.createElement("div")
  const child = document.createElement("span")
  marker.className = className
  marker.append(child)
  container.append(marker)
  const events = createMapPickingEvents(container)
  expect(events.shouldPick(click(child))).toBe(false)
  events.dispose()
})

it("respects events already consumed by a map control", () => {
  const container = document.createElement("div")
  const events = createMapPickingEvents(container)
  const event = click(container)
  event.preventDefault()
  expect(events.shouldPick(event)).toBe(false)
  events.dispose()
})
