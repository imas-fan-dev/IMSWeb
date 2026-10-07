import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useNativeExchangeSearch } from "~/pages/community/exchange/hooks/use-native-exchange-search"
import {
  NATIVE_GLASS_SEARCH_EVENT,
  type NativeGlassSearchSnapshot,
} from "~/lib/native-glass-search"

const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
  remove: vi.fn(),
  admit: vi.fn(),
}))
vi.mock("~/lib/native-glass-panel", () => ({
  shouldUseNativeGlassControls: mocks.admit,
}))
vi.mock("~/lib/native-glass-search", async (original) => ({
  ...(await original<typeof import("~/lib/native-glass-search")>()),
  syncNativeGlassSearch: mocks.sync,
  removeNativeGlassSearch: mocks.remove,
}))
const snapshot: Omit<NativeGlassSearchSnapshot, "generation"> = {
  id: "exchange-search",
  revision: 4,
  host: { x: 0, y: 0, width: 390, height: 844 },
  bottomClearance: 80,
  dark: false,
  detent: "collapsed",
  editing: false,
  query: "上海",
  busy: false,
  message: "",
  attribution: "© OpenStreetMap contributors",
  selected: "",
  filterApplied: false,
  pointCount: 2,
  hasAttribution: true,
  results: [{ id: "place:1", label: "上海", address: "上海市" }],
  labels: {},
}
describe("useNativeExchangeSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.admit.mockReturnValue(true)
    mocks.sync.mockResolvedValue({ supported: true })
    mocks.remove.mockResolvedValue(undefined)
  })
  it("waits for search-specific acknowledgment and rejects stale generations and result revisions", async () => {
    let resolve!: (status: { supported: boolean }) => void
    mocks.sync.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )
    const handler = vi.fn()
    const hook = renderHook(() => useNativeExchangeSearch(snapshot, handler))
    await waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce())
    expect(hook.result.current).toBe(false)
    await act(async () => resolve({ supported: true }))
    expect(hook.result.current).toBe(true)
    const generation = mocks.sync.mock.calls[0]![0].generation
    for (const detail of [
      {
        ...snapshot,
        generation: generation - 1,
        action: "select",
        value: "place:1",
      },
      {
        ...snapshot,
        generation,
        revision: 3,
        action: "select",
        value: "place:1",
      },
      { ...snapshot, generation, action: "select", value: "unknown" },
    ])
      act(() =>
        window.dispatchEvent(
          new CustomEvent(NATIVE_GLASS_SEARCH_EVENT, { detail })
        )
      )
    expect(handler).not.toHaveBeenCalled()
    act(() =>
      window.dispatchEvent(
        new CustomEvent(NATIVE_GLASS_SEARCH_EVENT, {
          detail: {
            ...snapshot,
            generation,
            action: "select",
            value: "place:1",
          },
        })
      )
    )
    expect(handler).toHaveBeenCalledOnce()
    hook.unmount()
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith("exchange-search", generation)
    )
  })
  it("removes the installed host before exposing the DOM after a failed update", async () => {
    const handler = vi.fn()
    const hook = renderHook(
      ({ value }) => useNativeExchangeSearch(value, handler),
      { initialProps: { value: snapshot } }
    )
    await waitFor(() => expect(hook.result.current).toBe(true))
    let removed!: () => void
    mocks.remove.mockReturnValueOnce(
      new Promise<void>((done) => {
        removed = done
      })
    )
    mocks.sync.mockRejectedValueOnce(new Error("bridge failed"))
    hook.rerender({ value: { ...snapshot, dark: true } })
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce())
    expect(hook.result.current).toBe(true)
    await act(async () => removed())
    expect(hook.result.current).toBe(false)
    hook.rerender({ value: { ...snapshot, query: "北京" } })
    expect(mocks.sync).toHaveBeenCalledTimes(2)
  })
  it("keeps fallback without invoking the bridge on an unadmitted platform", () => {
    mocks.admit.mockReturnValue(false)
    const hook = renderHook(() => useNativeExchangeSearch(snapshot, vi.fn()))
    expect(hook.result.current).toBe(false)
    expect(mocks.sync).not.toHaveBeenCalled()
    hook.unmount()
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it("rejects events from the previous modal presentation and keeps teardown ahead of reopening", async () => {
    const handler = vi.fn()
    const hook = renderHook(
      ({ value }: { value: typeof snapshot | null }) =>
        useNativeExchangeSearch(value, handler),
      { initialProps: { value: snapshot as typeof snapshot | null } }
    )
    await waitFor(() => expect(hook.result.current).toBe(true))
    const generation = mocks.sync.mock.calls[0]![0].generation
    let removed!: () => void
    mocks.remove.mockReturnValueOnce(
      new Promise<void>((done) => {
        removed = done
      })
    )
    hook.rerender({ value: null })
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce())
    hook.rerender({ value: snapshot })
    act(() =>
      window.dispatchEvent(
        new CustomEvent(NATIVE_GLASS_SEARCH_EVENT, {
          detail: { ...snapshot, generation, action: "input", value: "旧文本" },
        })
      )
    )
    expect(handler).not.toHaveBeenCalled()
    expect(mocks.sync).toHaveBeenCalledOnce()
    await act(async () => removed())
    await waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(2))
    expect(mocks.sync.mock.calls[1]![0].generation).toBeGreaterThan(generation)
  })
  it("retries a transient removal failure before restoring fallback", async () => {
    const hook = renderHook(
      ({ value }: { value: typeof snapshot | null }) =>
        useNativeExchangeSearch(value, vi.fn()),
      { initialProps: { value: snapshot as typeof snapshot | null } }
    )
    await waitFor(() => expect(hook.result.current).toBe(true))
    mocks.remove.mockRejectedValueOnce(new Error("temporary IPC failure"))
    hook.rerender({ value: null })
    await waitFor(() => expect(hook.result.current).toBe(false))
    expect(mocks.remove).toHaveBeenCalledTimes(2)
  })
  it("keeps DOM hidden until persistent teardown failure recovers and allows cancellation", async () => {
    const handler = vi.fn()
    const hook = renderHook(
      ({ value }) => useNativeExchangeSearch(value, handler),
      { initialProps: { value: snapshot } }
    )
    await waitFor(() => expect(hook.result.current).toBe(true))
    const generation = mocks.sync.mock.calls[0]![0].generation
    mocks.sync.mockRejectedValueOnce(new Error("failed update"))
    mocks.remove
      .mockRejectedValueOnce(new Error("failed teardown"))
      .mockRejectedValueOnce(new Error("still unavailable"))
    hook.rerender({ value: { ...snapshot, dark: true } })
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(2))
    expect(hook.result.current).toBe(true)
    act(() =>
      window.dispatchEvent(
        new CustomEvent(NATIVE_GLASS_SEARCH_EVENT, {
          detail: { ...snapshot, generation, action: "cancel" },
        })
      )
    )
    expect(handler).toHaveBeenCalledOnce()
    hook.rerender({ value: { ...snapshot, query: "恢复后的输入" } })
    await waitFor(() => expect(hook.result.current).toBe(false))
    expect(mocks.remove).toHaveBeenCalledTimes(3)
    expect(mocks.sync).toHaveBeenCalledTimes(2)
  })
})
