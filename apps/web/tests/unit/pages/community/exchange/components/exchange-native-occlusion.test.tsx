import { act, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useLayoutEffect, useState } from "react"
import { renderPage } from "@/tests/unit/support/harness"
import { ExchangeSearchCard } from "~/pages/community/exchange/components/exchange-search-card"
import { useExchangePlaceSearch } from "~/pages/community/exchange/hooks/use-exchange-place-search"
import { NATIVE_GLASS_SEARCH_EVENT } from "~/lib/native-glass-search"
import type { FudabaPlaceSearchResult } from "~/lib/api"

const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
  remove: vi.fn(),
  occlusion: vi.fn(),
}))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))
vi.mock("~/lib/native-glass-panel", () => ({
  shouldUseNativeGlassControls: () => true,
}))
vi.mock("~/lib/native-glass-search", async (original) => ({
  ...(await original<typeof import("~/lib/native-glass-search")>()),
  syncNativeGlassSearch: mocks.sync,
  removeNativeGlassSearch: mocks.remove,
}))

function Harness({
  modalOpen = false,
  onOcclusion = mocks.occlusion,
  selectedPlace = null,
}: {
  modalOpen?: boolean
  onOcclusion?: typeof mocks.occlusion
  selectedPlace?: FudabaPlaceSearchResult | null
}) {
  const model = useExchangePlaceSearch()
  return (
    <div>
      <ExchangeSearchCard
        model={model}
        selectedPlace={selectedPlace}
        onSelect={() => undefined}
        onClear={() => undefined}
        pointCount={0}
        onOcclusion={onOcclusion}
        modalOpen={modalOpen}
        onOpenFilter={() => undefined}
        onOpenOffices={() => undefined}
        onOpenCards={() => undefined}
        onRefresh={() => undefined}
      />
    </div>
  )
}

function renderHarness(initial: Parameters<typeof Harness>[0] = {}) {
  let update!: (props: Parameters<typeof Harness>[0]) => void
  function Controller() {
    const [props, setProps] = useState(initial)
    useLayoutEffect(() => {
      update = setProps
    }, [])
    return <Harness {...props} />
  }
  const view = renderPage(<Controller />)
  return {
    ...view,
    update: (props: Parameters<typeof Harness>[0]) => act(() => update(props)),
  }
}

function prepare() {
  mocks.sync.mockReset().mockResolvedValue({ supported: true })
  mocks.remove.mockReset().mockResolvedValue(undefined)
  mocks.occlusion.mockClear()
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
  let hostY = 0
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return this.tagName === "SECTION"
        ? new DOMRect(12, 700, 378, 150)
        : new DOMRect(0, hostY, 402, 874)
    }
  )
  return (value: number) => {
    hostY = value
  }
}

function emit(action: string, extra: object = {}) {
  const snapshot = mocks.sync.mock.calls.at(-1)![0]
  act(() =>
    window.dispatchEvent(
      new CustomEvent(NATIVE_GLASS_SEARCH_EVENT, {
        detail: {
          id: snapshot.id,
          generation: snapshot.generation,
          revision: snapshot.revision,
          action,
          ...extra,
        },
      })
    )
  )
}

describe("native search occlusion ownership", () => {
  it("keeps native expansion owned until the renderer reports its completed collapsed detent", async () => {
    prepare()
    const view = renderHarness()
    await waitFor(() => expect(mocks.sync).toHaveBeenCalled())
    emit("detent", { value: "large" })
    emit("input", { value: "保留草稿" })
    await waitFor(() =>
      expect(mocks.sync.mock.calls.at(-1)?.[0]).toMatchObject({
        detent: "large",
        editing: true,
      })
    )
    emit("cancel")
    await waitFor(() =>
      expect(mocks.sync.mock.calls.at(-1)?.[0]).toMatchObject({
        detent: "large",
        editing: false,
      })
    )
    emit("detent", { value: "collapsed" })
    await waitFor(() =>
      expect(mocks.sync.mock.calls.at(-1)?.[0]).toMatchObject({
        detent: "collapsed",
        editing: false,
        query: "保留草稿",
      })
    )
    view.unmount()
  })
  it("sends independent selected name and address and clears both without losing the search draft", async () => {
    prepare()
    const place: FudabaPlaceSearchResult = {
      id: "place:selected",
      label: "西岸艺术中心",
      address: "上海市徐汇区龙腾大道",
      city: "上海市",
      location: { latitude: 31.2, longitude: 121.5, precision: "exact" },
    }
    const view = renderHarness({ selectedPlace: place })
    await waitFor(() =>
      expect(mocks.sync.mock.calls.at(-1)?.[0]).toMatchObject({
        selected: "已定位：西岸艺术中心",
        selectedLabel: place.label,
        selectedAddress: place.address,
      })
    )
    emit("input", { value: "保留草稿" })
    await waitFor(() =>
      expect(mocks.sync.mock.calls.at(-1)?.[0].query).toBe("保留草稿")
    )
    view.update({})
    await waitFor(() =>
      expect(mocks.sync.mock.calls.at(-1)?.[0]).toMatchObject({
        selected: "",
        selectedLabel: "",
        selectedAddress: "",
        query: "保留草稿",
      })
    )
    view.unmount()
    await waitFor(() => expect(mocks.remove).toHaveBeenCalled())
  })

  it("retains geometry received before acknowledgment through readiness, unchanged frames, position and detent changes", async () => {
    const moveHost = prepare()
    let acknowledge!: (value: { supported: boolean }) => void
    mocks.sync.mockReturnValueOnce(
      new Promise((resolve) => {
        acknowledge = resolve
      })
    )
    const view = renderHarness()
    await waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce())
    const frame = { x: 12, y: 588, width: 378, height: 156 }
    emit("geometry", { frame })
    expect(mocks.occlusion).toHaveBeenLastCalledWith(frame)
    const callsAfterFrame = mocks.occlusion.mock.calls.length
    await act(async () => acknowledge({ supported: true }))
    expect(screen.getByRole("region", { hidden: true })).toHaveAttribute(
      "data-native-search",
      "true"
    )
    expect(
      mocks.occlusion.mock.calls
        .slice(callsAfterFrame)
        .every(([value]) => value !== null)
    ).toBe(true)
    expect(mocks.occlusion).toHaveBeenLastCalledWith(frame)
    moveHost(20)
    act(() => window.dispatchEvent(new Event("resize")))
    await waitFor(() => expect(mocks.sync).toHaveBeenCalledTimes(2))
    expect(mocks.occlusion).toHaveBeenLastCalledWith({ ...frame, y: 568 })
    emit("detent", { value: "medium" })
    expect(mocks.occlusion).toHaveBeenLastCalledWith({ ...frame, y: 568 })
    const replacement = vi.fn()
    view.update({ onOcclusion: replacement })
    expect(replacement).toHaveBeenLastCalledWith({ ...frame, y: 568 })
    expect(
      mocks.occlusion.mock.calls
        .slice(callsAfterFrame)
        .every(([value]) => value !== null)
    ).toBe(true)
    view.update({ modalOpen: true, onOcclusion: replacement })
    await waitFor(() => expect(mocks.remove).toHaveBeenCalled())
    expect(replacement).toHaveBeenLastCalledWith(null)
    view.update({ onOcclusion: replacement })
    await waitFor(() =>
      expect(mocks.sync.mock.calls.at(-1)![0].detent).toBe("collapsed")
    )
    // The restored session has not sent geometry. It cannot reuse the old frame.
    expect(replacement).toHaveBeenLastCalledWith({
      x: 12,
      y: 680,
      width: 378,
      height: 150,
    })
    view.unmount()
    expect(replacement).toHaveBeenLastCalledWith(null)
  })

  it("returns geometry ownership to DOM only after unsupported native removal is acknowledged", async () => {
    prepare()
    let acknowledge!: (value: { supported: boolean }) => void
    let removed!: () => void
    mocks.sync.mockReturnValueOnce(
      new Promise((resolve) => {
        acknowledge = resolve
      })
    )
    const view = renderPage(<Harness />)
    await waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce())
    const frame = { x: 12, y: 588, width: 378, height: 156 }
    emit("geometry", { frame })
    mocks.remove.mockClear().mockReturnValueOnce(
      new Promise<void>((resolve) => {
        removed = resolve
      })
    )
    await act(async () => acknowledge({ supported: false }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce())
    expect(mocks.occlusion).toHaveBeenLastCalledWith(frame)
    await act(async () => removed())
    expect(mocks.occlusion).toHaveBeenLastCalledWith({
      x: 12,
      y: 700,
      width: 378,
      height: 150,
    })
    expect(
      screen.getByRole("region", { name: "地点查找" })
    ).not.toHaveAttribute("data-native-search")
    view.unmount()
    expect(mocks.occlusion).toHaveBeenLastCalledWith(null)
  })
})
