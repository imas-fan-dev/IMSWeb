import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useDebouncedValue } from "~/lib/use-debounced-value"

describe("useDebouncedValue", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("trails the value until the delay elapses", () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } }
    )

    expect(result.current).toBe("a")

    rerender({ value: "b" })
    expect(result.current).toBe("a")

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe("a")

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe("b")
  })

  it("restarts the timer when the value changes again mid-wait", () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 300),
      { initialProps: { value: "" } }
    )

    rerender({ value: "春" })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ value: "春香" })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe("")

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe("春香")
  })

  it("drops the pending update when the component unmounts", () => {
    vi.useFakeTimers()
    const { result, rerender, unmount } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } }
    )

    rerender({ value: "b" })
    unmount()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe("a")
  })
})
