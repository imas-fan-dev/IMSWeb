import { act, renderHook } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { useMapOnboarding } from "~/pages/community/exchange/hooks/use-map-onboarding"

it("waits for readiness, remembers a skip, and permits explicit replay", () => {
  vi.useFakeTimers()
  localStorage.removeItem("ims:exchange-map-guide:v1")
  const hook = renderHook(
    ({ ready, covered }) => useMapOnboarding(ready, covered),
    { initialProps: { ready: false, covered: false } }
  )
  act(() => vi.advanceTimersByTime(1000))
  expect(hook.result.current.step).toBeNull()
  hook.rerender({ ready: true, covered: true })
  act(() => vi.advanceTimersByTime(1000))
  expect(hook.result.current.step).toBeNull()
  hook.rerender({ ready: true, covered: false })
  act(() => vi.advanceTimersByTime(600))
  expect(hook.result.current.step).toBe(0)
  act(() => hook.result.current.finish())
  expect(localStorage.getItem("ims:exchange-map-guide:v1")).toBe("done")
  expect(hook.result.current.step).toBeNull()
  act(() => hook.result.current.replay())
  expect(hook.result.current.step).toBe(0)
  act(() => hook.result.current.finish())
  hook.unmount()
  const next = renderHook(() => useMapOnboarding(true, false))
  act(() => vi.advanceTimersByTime(1000))
  expect(next.result.current.step).toBeNull()
  next.unmount()
  vi.useRealTimers()
})
