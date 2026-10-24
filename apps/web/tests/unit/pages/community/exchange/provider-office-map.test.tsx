import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import { ProviderOfficeMap } from "~/pages/community/exchange/provider-office-map"
import type { MapDriver, MapView, MapPosition } from "~/lib/maps/map-engine"

vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: false }))
vi.mock("~/lib/native-glass-controls", () => ({
  useNativeGlassControl: () => ({
    controlRef: { current: null },
    refreshGeometry: () => {},
  }),
}))
const coordinates = vi.hoisted(() =>
  vi.fn(async () => ({ longitude: 121.4, latitude: 31.2 }))
)
vi.mock("~/lib/geolocation", async (original) => ({
  ...(await original<typeof import("~/lib/geolocation")>()),
  getCurrentCoordinates: coordinates,
}))

let resizeObservedMap: () => void
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resizeObservedMap = callback
      }
      observe() {}
      disconnect() {}
    }
  )
})

function fixture() {
  const listeners = new Map<string, () => void>()
  const markers: {
    position: MapPosition
    content: HTMLElement
    remove: ReturnType<typeof vi.fn<() => void>>
  }[] = []
  const destroy = vi.fn()
  const focus = vi.fn<MapView["focus"]>(async () => {})
  const resize = vi.fn()
  const getZoom = vi.fn(() => 16)
  let container: HTMLDivElement
  const view: MapView = {
    read: () => ({
      zoom: getZoom(),
      bounds: { west: 115, south: 30, east: 125, north: 40 },
    }),
    project: vi.fn<MapView["project"]>(async (points) =>
      points.map(([x, y]) => ({ x, y }))
    ),
    async addMarker({ position, element }) {
      container.append(element)
      const marker = {
        position,
        content: element,
        remove: vi.fn(() => element.remove()),
      }
      markers.push(marker)
      return marker
    },
    focus,
    addSearchMarker({ target, element, anchor }) {
      return view.addMarker({ position: target.position, element, anchor })
    },
    focusSearch(target, options) {
      return view.focus(target.position, options)
    },
    panBy() {},
    resize,
    destroy,
  }
  const open = vi.fn<MapDriver["open"]>((element, options) => {
    container = element
    listeners.set("change", options.onChange)
    listeners.set("resource-error", options.onResourceError)
    return new Promise((resolve) => listeners.set("ready", () => resolve(view)))
  })
  const onViewportChange = vi.fn()
  const onFatalError = vi.fn()
  const onAttributionChange = vi.fn()
  const onDevicePosition = vi.fn()
  const onSelectGroup = vi.fn()
  const onRetry = vi.fn()
  const props = {
    driver: { id: "test", open },
    groups: [
      {
        key: "shanghai",
        longitude: 121.4,
        latitude: 31.2,
        colors: ["#f34e6c"],
        offices: [],
      },
    ],
    selectedGroupKey: null,
    onViewportChange,
    onFatalError,
    onAttributionChange,
    onDevicePosition,
    onSelectGroup,
    onRetry,
    attribution: {
      segments: [{ kind: "text" as const, value: "test attribution" }],
    },
  }
  return {
    view,
    open,
    props,
    listeners,
    markers,
    destroy,
    focus,
    resize,
    getZoom,
  }
}

it("exposes a selected Web point inside a cluster without moving the camera or requesting data", async () => {
  const test = fixture()
  test.getZoom.mockReturnValue(3)
  const groups = [
    test.props.groups[0]!,
    { ...test.props.groups[0]!, key: "nearby", longitude: 121.5 },
  ]
  const view = render(<ProviderOfficeMap {...test.props} groups={groups} />)
  await act(async () => test.listeners.get("ready")!())
  await screen.findByRole("button", { name: "2 个区域点，放大查看" })
  const requests = test.props.onViewportChange.mock.calls.length
  view.rerender(
    <ProviderOfficeMap
      {...test.props}
      groups={groups}
      selectedGroupKey="nearby"
    />
  )
  await waitFor(() =>
    expect(
      view.container.querySelector('[data-map-office-group="nearby"]')
    ).toHaveAttribute("aria-pressed", "true")
  )
  expect(
    screen.queryByRole("button", { name: "2 个区域点，放大查看" })
  ).not.toBeInTheDocument()
  expect(test.focus).not.toHaveBeenCalled()
  expect(test.props.onViewportChange).toHaveBeenCalledTimes(requests)
  view.rerender(<ProviderOfficeMap {...test.props} groups={groups} />)
  await screen.findByRole("button", { name: "2 个区域点，放大查看" })
  expect(
    view.container.querySelector('[data-map-office-group="nearby"]')
  ).toBeNull()
})

it("focuses only explicit list commands and retires an older focus when selection changes", async () => {
  const test = fixture()
  const request = { key: "shanghai", sequence: 1 }
  const view = render(
    <ProviderOfficeMap
      {...test.props}
      selectedGroupKey="shanghai"
      groupFocus={request}
    />
  )
  await act(async () => test.listeners.get("ready")!())
  await waitFor(() => expect(test.focus).toHaveBeenCalledOnce())
  expect(test.focus).toHaveBeenLastCalledWith(
    [121.4, 31.2],
    expect.objectContaining({ zoom: 16, signal: expect.any(AbortSignal) })
  )
  const firstSignal = test.focus.mock.calls[0]?.[1]?.signal
  view.rerender(
    <ProviderOfficeMap
      {...test.props}
      selectedGroupKey="shanghai"
      groupFocus={request}
      groups={[...test.props.groups]}
    />
  )
  expect(test.focus).toHaveBeenCalledOnce()
  view.rerender(
    <ProviderOfficeMap
      {...test.props}
      selectedGroupKey="shanghai"
      groupFocus={{ key: "shanghai", sequence: 2 }}
    />
  )
  await waitFor(() => expect(test.focus).toHaveBeenCalledTimes(2))
  expect(firstSignal?.aborted).toBe(true)
  view.rerender(<ProviderOfficeMap {...test.props} />)
  expect(test.focus.mock.calls[1]?.[1]?.signal?.aborted).toBe(true)
})

it("waits for the driver and passes office/search/location positions through the WGS84 interaction contract", async () => {
  const test = fixture()
  const selectedPlace = {
    id: "place",
    label: "上海",
    address: "上海",
    target: { kind: "wgs84" as const, position: [121.5, 31.3] as MapPosition },
  }
  const view = render(
    <ProviderOfficeMap {...test.props} selectedPlace={selectedPlace} />
  )
  await waitFor(() => expect(test.listeners.has("ready")).toBe(true))
  expect(test.props.onViewportChange).not.toHaveBeenCalled()
  await act(async () => test.listeners.get("ready")!())
  await waitFor(() => expect(test.markers.length).toBeGreaterThanOrEqual(2))
  expect(test.props.onViewportChange).toHaveBeenCalledWith([[115, 30, 125, 40]])
  expect(test.props.onAttributionChange).toHaveBeenCalledWith(
    test.props.attribution
  )
  expect(test.markers.some((marker) => marker.position[0] === 121.5)).toBe(true)
  expect(test.focus).toHaveBeenCalledWith([121.5, 31.3], {
    zoom: 13,
    duration: expect.any(Number),
    signal: expect.any(AbortSignal),
  })
  await userEvent.click(screen.getByRole("button", { name: /0 个事务所/ }))
  expect(test.props.onSelectGroup).toHaveBeenCalledWith("shanghai")
  await userEvent.click(screen.getByRole("button", { name: "回到我的位置" }))
  await waitFor(() =>
    expect(test.focus).toHaveBeenCalledWith([121.4, 31.2], {
      zoom: 16,
      duration: expect.any(Number),
    })
  )
  view.unmount()
  expect(test.destroy).toHaveBeenCalledTimes(1)
  expect(
    test.markers.every((marker) => marker.remove.mock.calls.length > 0)
  ).toBe(true)
})

it("attempts initial geolocation after readiness and uses the manual marker path", async () => {
  const test = fixture()
  const claim = vi.fn(() => new AbortController().signal)
  const before = coordinates.mock.calls.length
  render(<ProviderOfficeMap {...test.props} claimInitialLocation={claim} />)
  expect(coordinates.mock.calls.length).toBe(before)
  await act(async () => test.listeners.get("ready")!())
  await waitFor(() => expect(coordinates.mock.calls.length).toBe(before + 1))
  await waitFor(() =>
    expect(test.focus).toHaveBeenCalledWith(
      [121.4, 31.2],
      expect.objectContaining({ zoom: 16 })
    )
  )
  expect(claim).toHaveBeenCalledOnce()
  expect(test.props.onDevicePosition).toHaveBeenCalledWith([121.4, 31.2])
  expect(screen.getByRole("img", { name: "您的当前位置" })).toBeInTheDocument()
})

it("keeps the default camera silently on an initial location error and allows manual retry", async () => {
  coordinates.mockRejectedValueOnce(new Error("location denied"))
  const test = fixture()
  render(
    <ProviderOfficeMap
      {...test.props}
      claimInitialLocation={() => new AbortController().signal}
    />
  )
  await act(async () => test.listeners.get("ready")!())
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "回到我的位置" })).toBeEnabled()
  )
  expect(test.focus).not.toHaveBeenCalled()
  expect(test.props.onFatalError).not.toHaveBeenCalled()
  expect(
    screen.queryByRole("img", { name: "您的当前位置" })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText(/未获得位置权限|暂时无法获取您的位置/)
  ).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "回到我的位置" }))
  await waitFor(() => expect(test.focus).toHaveBeenCalled())
})

it("does not recenter when initial coordinates arrive after search owns the camera", async () => {
  let finish!: (value: { longitude: number; latitude: number }) => void
  coordinates.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const test = fixture()
  const controller = new AbortController()
  render(
    <ProviderOfficeMap
      {...test.props}
      claimInitialLocation={() => controller.signal}
    />
  )
  await act(async () => test.listeners.get("ready")!())
  controller.abort()
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "回到我的位置" })).toBeEnabled()
  )
  expect(test.focus).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole("button", { name: "回到我的位置" }))
  await waitFor(() => expect(test.focus).toHaveBeenCalledOnce())
  await act(async () => finish({ longitude: 88, latitude: 30 }))
  expect(test.focus).toHaveBeenCalledOnce()
  expect(test.markers.some((marker) => marker.position[0] === 88)).toBe(false)
  expect(screen.getByRole("button", { name: "回到我的位置" })).toBeEnabled()
})

it("aborts pending initialization and destroys a driver result arriving after unmount", async () => {
  const test = fixture()
  const view = render(<ProviderOfficeMap {...test.props} />)
  await waitFor(() => expect(test.open).toHaveBeenCalled())
  view.unmount()
  expect(test.open.mock.calls[0]![1].signal.aborted).toBe(true)
  await act(async () => test.listeners.get("ready")!())
  expect(test.destroy).toHaveBeenCalledTimes(1)
  expect(test.markers).toHaveLength(0)
  expect(test.props.onFatalError).not.toHaveBeenCalled()
})

it("skips search-panel camera adjustment when the user's movement interrupted the focus", async () => {
  const test = fixture()
  const focus = vi.spyOn(test.view, "focusSearch").mockResolvedValue(false)
  const pan = vi.spyOn(test.view, "panBy")
  render(
    <ProviderOfficeMap
      {...test.props}
      selectedPlace={{
        id: "place",
        label: "上海",
        address: "上海",
        target: { kind: "wgs84", position: [121.5, 31.3] },
      }}
      occlusion={{ x: 0, y: 450, width: 390, height: 280 }}
    />
  )
  await act(async () => test.listeners.get("ready")!())
  await waitFor(() => expect(focus).toHaveBeenCalledOnce())
  expect(pan).not.toHaveBeenCalled()
  expect(test.props.onFatalError).not.toHaveBeenCalled()
})

it("removes a marker arriving after the host unmounts", async () => {
  const test = fixture()
  let finish!: (marker: { remove(): void }) => void
  const add = vi.spyOn(test.view, "addMarker").mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const host = render(<ProviderOfficeMap {...test.props} />)
  await act(async () => test.listeners.get("ready")!())
  await waitFor(() => expect(add).toHaveBeenCalled())
  host.unmount()
  const marker = { remove: vi.fn() }
  await act(async () => finish(marker))
  expect(marker.remove).toHaveBeenCalledTimes(1)
  expect(test.props.onFatalError).not.toHaveBeenCalled()
})

it("recreates a restored marker while an obsolete replacement is still pending", async () => {
  const test = fixture()
  const host = render(<ProviderOfficeMap {...test.props} />)
  await act(async () => test.listeners.get("ready")!())
  const original = await screen.findByRole("button", { name: /0 个事务所/ })
  let finish!: (marker: { remove(): void }) => void
  const add = vi.spyOn(test.view, "addMarker").mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  host.rerender(
    <ProviderOfficeMap
      {...test.props}
      groups={test.props.groups.map((group) => ({
        ...group,
        colors: ["#123456"],
      }))}
    />
  )
  await waitFor(() => expect(add).toHaveBeenCalledTimes(1))
  expect(original).not.toBeInTheDocument()
  host.rerender(<ProviderOfficeMap {...test.props} />)
  const restored = await screen.findByRole("button", { name: /0 个事务所/ })
  expect(restored).not.toBe(original)
  const obsolete = { remove: vi.fn() }
  await act(async () => finish(obsolete))
  expect(obsolete.remove).toHaveBeenCalledTimes(1)
  expect(restored).toBeInTheDocument()
  expect(test.props.onFatalError).not.toHaveBeenCalled()
})

it("expands clusters past the former camera limit and splits them at the independent clustering cutoff", async () => {
  const test = fixture()
  test.getZoom.mockReturnValue(10.5)
  render(
    <ProviderOfficeMap
      {...test.props}
      groups={[
        ...test.props.groups,
        {
          ...test.props.groups[0]!,
          key: "shanghai-nearby",
          longitude: 121.4001,
        },
      ]}
    />
  )
  await waitFor(() => expect(test.listeners.has("ready")).toBe(true))
  await act(async () => test.listeners.get("ready")!())
  await userEvent.click(
    await screen.findByRole("button", { name: "2 个区域点，放大查看" })
  )
  expect(test.focus).toHaveBeenCalledWith([121.4, 31.2], {
    zoom: 12.5,
    duration: expect.any(Number),
  })
  test.getZoom.mockReturnValue(12.5)
  await act(async () => test.listeners.get("change")!())
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: /0 个事务所/ })).toHaveLength(
      2
    )
  )
  expect(
    screen.queryByRole("button", { name: "2 个区域点，放大查看" })
  ).not.toBeInTheDocument()
})

it("resizes the engine, keeps side-panel attribution in the map and preserves selected marker focus", async () => {
  const test = fixture()
  const props = {
    ...test.props,
    occlusion: { x: 0, y: 12, width: 400, height: 680 },
  }
  const view = render(<ProviderOfficeMap {...props} />)
  await waitFor(() => expect(test.listeners.has("ready")).toBe(true))
  await act(async () => test.listeners.get("ready")!())
  const workspace = screen.getByLabelText("区域事务所地图工作面")
  Object.defineProperties(workspace, {
    clientWidth: { value: 1000 },
    clientHeight: { value: 700 },
  })
  await act(async () => resizeObservedMap())
  expect(test.resize).toHaveBeenCalledTimes(1)
  expect(workspace.style.getPropertyValue("--map-attribution-bottom")).toBe(
    "8px"
  )
  expect(workspace.style.getPropertyValue("--map-attribution-left")).toBe(
    "412px"
  )
  const button = screen.getByRole("button", { name: /0 个事务所/ })
  button.focus()
  view.rerender(<ProviderOfficeMap {...props} selectedGroupKey="shanghai" />)
  await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "true"))
  expect(button).toHaveFocus()
})

it.each([
  {
    width: 1000,
    height: 700,
    occlusion: { x: 0, y: 12, width: 400, height: 680 },
    pan: { x: 206, y: 0 },
  },
  {
    width: 390,
    height: 844,
    occlusion: { x: 12, y: 300, width: 366, height: 480 },
    pan: { x: 0, y: -278 },
  },
])(
  "keeps corner attribution fixed without losing search occlusion at $width px",
  async ({ width, height, occlusion, pan }) => {
    const test = fixture()
    const panBy = vi.spyOn(test.view, "panBy")
    const props = {
      ...test.props,
      occlusion,
      attributionPlacement: "corner" as const,
    }
    const host = render(<ProviderOfficeMap {...props} />)
    await act(async () => test.listeners.get("ready")!())
    const map = screen.getByLabelText("区域事务所地图工作面")
    Object.defineProperties(map, {
      clientWidth: { value: width },
      clientHeight: { value: height },
    })
    await act(async () => resizeObservedMap())
    expect(map.style.getPropertyValue("--map-attribution-left")).toBe("8px")
    expect(map.style.getPropertyValue("--map-attribution-bottom")).toBe(
      "calc(8px + env(safe-area-inset-bottom, 0px))"
    )
    host.rerender(
      <ProviderOfficeMap
        {...props}
        selectedPlace={{
          id: "place",
          label: "上海",
          address: "上海",
          target: { kind: "wgs84", position: [121.5, 31.3] },
        }}
      />
    )
    await waitFor(() =>
      expect(panBy).toHaveBeenCalledWith(pan, expect.any(Number))
    )
  }
)

it("keeps a loaded map on resource errors and offers an explicit configuration reload", async () => {
  const test = fixture()
  render(<ProviderOfficeMap {...test.props} />)
  await waitFor(() => expect(test.listeners.has("ready")).toBe(true))
  await act(async () => test.listeners.get("ready")!())
  await act(async () => test.listeners.get("resource-error")!())
  expect(test.props.onFatalError).not.toHaveBeenCalled()
  expect(test.destroy).not.toHaveBeenCalled()
  expect(
    screen.getByText("部分地图资源加载失败，已保留当前地图。")
  ).toBeVisible()
  await userEvent.click(screen.getByRole("button", { name: "重试地图" }))
  expect(test.props.onRetry).toHaveBeenCalledTimes(1)
})

it("retains cluster DOM and number when panning at the same zoom", async () => {
  const test = fixture()
  test.getZoom.mockReturnValue(4)
  render(
    <ProviderOfficeMap
      {...test.props}
      groups={[
        ...test.props.groups,
        { ...test.props.groups[0]!, key: "shanghai-nearby", longitude: 121.5 },
      ]}
    />
  )
  await act(async () => test.listeners.get("ready")!())
  const cluster = await screen.findByRole("button", {
    name: "2 个区域点，放大查看",
  })
  cluster.focus()
  const count = test.markers.length
  const removals = test.markers.map((marker) => marker.remove.mock.calls.length)
  vi.spyOn(test.view, "project").mockImplementation(async (points) =>
    points.map(() => ({ x: 999, y: -999 }))
  )
  await act(async () => {
    for (let i = 0; i < 8; i++) test.listeners.get("change")!()
  })
  expect(screen.getByRole("button", { name: "2 个区域点，放大查看" })).toBe(
    cluster
  )
  expect(cluster).toHaveFocus()
  expect(test.markers).toHaveLength(count)
  expect(test.markers.map((marker) => marker.remove.mock.calls.length)).toEqual(
    removals
  )
})
