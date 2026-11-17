import { afterEach, expect, it, vi } from "vitest"

import {
  createUserLocationMarker,
  USER_LOCATION_HINT_DURATION,
} from "~/pages/community/exchange/maps/user-location-marker"

afterEach(() => vi.useRealTimers())

it("anchors a temporary hint to the user marker while keeping the location dot", () => {
  vi.useFakeTimers()
  const marker = createUserLocationMarker()
  const dot = marker.element.querySelector('[role="img"]')!
  expect(dot.getAttribute("aria-label")).toBe("您的当前位置")
  expect(marker.element.textContent).toBe("")
  marker.showHint()
  expect(dot.textContent).toBe("已回到您的位置")
  vi.advanceTimersByTime(USER_LOCATION_HINT_DURATION - 1)
  expect(dot.textContent).toBe("已回到您的位置")
  vi.advanceTimersByTime(1)
  expect(dot.textContent).toBe("")
  expect(marker.element.contains(dot)).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it("restarts the hint duration and cleans up pending dismissals", () => {
  vi.useFakeTimers()
  const marker = createUserLocationMarker()
  marker.showHint()
  vi.advanceTimersByTime(2000)
  marker.showHint()
  vi.advanceTimersByTime(2000)
  expect(marker.element.textContent).toBe("已回到您的位置")
  marker.dismissHint()
  expect(marker.element.textContent).toBe("")
  expect(vi.getTimerCount()).toBe(0)
})
