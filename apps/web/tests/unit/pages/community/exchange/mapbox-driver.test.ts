import { beforeEach, expect, it, vi } from "vitest"
import type { MapOptions } from "mapbox-gl"
import { createMapboxDriver } from "~/pages/community/exchange/mapbox-driver"

const mocks = vi.hoisted(() => ({
  options: [] as MapOptions[],
  events: new Map<string, () => void>(),
  removed: vi.fn(),
  resized: vi.fn(),
  rotation: vi.fn(),
  markerRemoved: vi.fn(),
  markerPosition: vi.fn(),
  focus: vi.fn(),
  pan: vi.fn(),
  theme: vi.fn(),
  labels: vi.fn(),
  pluginStatus: vi.fn(() => "unavailable"),
  plugin: vi.fn(),
  appTarget: false,
  retained: vi.fn(),
}))
vi.mock("mapbox-gl", () => ({
  default: {
    getRTLTextPluginStatus: mocks.pluginStatus,
    setRTLTextPlugin: mocks.plugin,
    AttributionControl: class {},
    Map: class {
      touchZoomRotate = { disableRotation: mocks.rotation }
      keyboard = { disableRotation: mocks.rotation }
      constructor(options: MapOptions) {
        mocks.options.push(options)
      }
      on(event: string, callback: () => void) {
        mocks.events.set(event, callback)
      }
      addControl() {}
      getCenter() {
        return { lng: 121.4, lat: 31.2 }
      }
      getZoom() {
        return 8
      }
      getBounds() {
        return {
          getWest: () => 115,
          getSouth: () => 30,
          getEast: () => 125,
          getNorth: () => 40,
        }
      }
      project() {
        return { x: 100, y: 200 }
      }
      easeTo = mocks.focus
      panBy = mocks.pan
      remove = mocks.removed
      resize = mocks.resized
    },
    Marker: class {
      setLngLat(position: [number, number]) {
        mocks.markerPosition(position)
        return this
      }
      addTo() {
        return this
      }
      remove = mocks.markerRemoved
    },
  },
}))
vi.mock("~/lib/app-target", () => ({
  get IS_APP_TARGET() {
    return mocks.appTarget
  },
}))
vi.mock("~/pages/community/exchange/exchange-map-model", () => ({
  rememberExchangeMapViewport: mocks.retained,
}))
vi.mock("~/pages/community/exchange/mapbox-map-theme", () => ({
  applyMapboxPortalTheme: mocks.theme,
}))
vi.mock("~/pages/community/exchange/mapbox-map-language", () => ({
  MAPBOX_LOCAL_LANGUAGE: "mul",
  applyMapboxLocalLabels: mocks.labels,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.options.length = 0
  mocks.events.clear()
  mocks.appTarget = false
})
const config = {
  provider: "mapbox" as const,
  accessToken: "pk.public-mapbox-token-1234567890",
  styleUrl: "mapbox://styles/mapbox/streets-v12",
}
const openOptions = () => ({
  viewport: { center: [121.4, 31.2] as [number, number], zoom: 18 },
  minZoom: 2.3,
  signal: new AbortController().signal,
  onChange: vi.fn(),
  onResourceError: vi.fn(),
})

it("uses the official Mapbox SDK with per-instance credentials, native attribution and WGS84 positions", async () => {
  const controller = new AbortController()
  const pending = createMapboxDriver(config).open(
    document.createElement("div"),
    { ...openOptions(), signal: controller.signal }
  )
  mocks.events.get("style.load")!()
  expect(mocks.theme).toHaveBeenCalledWith(expect.anything(), config.styleUrl)
  expect(mocks.labels).toHaveBeenCalledTimes(1)
  mocks.events.get("style.load")!()
  expect(mocks.labels).toHaveBeenCalledTimes(2)
  mocks.events.get("load")!()
  const map = await pending
  expect(mocks.options[0]).toMatchObject({
    accessToken: "pk.public-mapbox-token-1234567890",
    style: "mapbox://styles/mapbox/streets-v12",
    center: [121.4, 31.2],
    zoom: 18,
    minZoom: 2.3,
    attributionControl: false,
    language: "mul",
    localIdeographFontFamily: "",
  })
  expect(mocks.options[0]).not.toHaveProperty("maxZoom")
  expect(mocks.plugin).toHaveBeenCalledWith(
    "https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.4.0/mapbox-gl-rtl-text.js",
    expect.any(Function),
    true
  )
  expect(await map.project([[121.4, 31.2]])).toEqual([{ x: 100, y: 200 }])
  expect(map.read()).toEqual({
    zoom: 8,
    bounds: { west: 115, south: 30, east: 125, north: 40 },
  })
  await map.focus([121.4, 31.2], { zoom: 19, duration: 0 })
  expect(mocks.focus).toHaveBeenCalledWith({
    center: [121.4, 31.2],
    zoom: 19,
    duration: 0,
    essential: false,
  })
  map.panBy({ x: 100, y: -50 }, 0)
  expect(mocks.pan).toHaveBeenCalledWith([-100, 50], { duration: 0 })
  map.resize()
  expect(mocks.resized).toHaveBeenCalledTimes(1)
  const element = document.createElement("button")
  const marker = await map.addMarker({
    position: [121.4, 31.2],
    element,
    anchor: "bottom",
  })
  expect(element).toHaveAttribute("role", "button")
  expect(mocks.markerPosition).toHaveBeenCalledExactlyOnceWith([121.4, 31.2])
  controller.abort()
  marker.remove()
  expect(mocks.markerRemoved).toHaveBeenCalledTimes(1)
  map.destroy()
  expect(mocks.removed).toHaveBeenCalledTimes(1)
})

it("aborts an initializing native view and ignores late load/style/error events", async () => {
  const controller = new AbortController()
  const options = { ...openOptions(), signal: controller.signal }
  const pending = createMapboxDriver(config).open(
    document.createElement("div"),
    options
  )
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" })
  controller.abort()
  mocks.events.get("load")!()
  mocks.events.get("style.load")!()
  mocks.events.get("error")!()
  await rejected
  expect(mocks.removed).toHaveBeenCalledTimes(1)
  expect(mocks.theme).not.toHaveBeenCalled()
  expect(mocks.labels).not.toHaveBeenCalled()
  expect(options.onChange).not.toHaveBeenCalled()
  expect(options.onResourceError).not.toHaveBeenCalled()
})

it("never retains a temporary search viewport on movement or close, and resumes normal retention after canonical focus", async () => {
  mocks.appTarget = true
  const first = createMapboxDriver(config).open(
    document.createElement("div"),
    openOptions()
  )
  mocks.events.get("load")!()
  const map = await first
  await map.focusSearch(
    { kind: "wgs84", position: [139, 35] },
    { zoom: 13, duration: 0 }
  )
  mocks.events.get("moveend")!()
  map.destroy()
  expect(mocks.retained).not.toHaveBeenCalled()

  const second = createMapboxDriver(config).open(
    document.createElement("div"),
    openOptions()
  )
  mocks.events.get("load")!()
  const next = await second
  await next.focusSearch(
    { kind: "wgs84", position: [139, 35] },
    { zoom: 13, duration: 0 }
  )
  await next.focus([121.4, 31.2], { zoom: 13, duration: 0 })
  mocks.events.get("moveend")!()
  expect(mocks.retained).toHaveBeenCalledExactlyOnceWith({
    center: [121.4, 31.2],
    zoom: 8,
  })
  await expect(
    next.focusSearch(
      { kind: "native", provider: "amap", position: [121, 31] },
      { zoom: 13, duration: 0 }
    )
  ).rejects.toMatchObject({ kind: "unavailable" })
  next.destroy()
})

it("disposes a native view when initialization setup throws", async () => {
  mocks.rotation.mockImplementationOnce(() => {
    throw new Error("setup rejected")
  })
  await expect(
    createMapboxDriver(config).open(
      document.createElement("div"),
      openOptions()
    )
  ).rejects.toThrow("setup rejected")
  expect(mocks.removed).toHaveBeenCalledTimes(1)
})

it("does not register an already deferred RTL plugin and ignores errors after disposal", async () => {
  mocks.pluginStatus.mockReturnValueOnce("deferred")
  const pending = createMapboxDriver(config).open(
    document.createElement("div"),
    openOptions()
  )
  mocks.events.get("load")!()
  const map = await pending
  expect(mocks.plugin).not.toHaveBeenCalled()
  map.destroy()

  const options = openOptions()
  const next = createMapboxDriver(config).open(
    document.createElement("div"),
    options
  )
  mocks.events.get("load")!()
  const nextMap = await next
  const callback = mocks.plugin.mock.calls[0][1]
  callback(new Error("RTL failed"))
  expect(options.onResourceError).toHaveBeenCalledTimes(1)
  nextMap.destroy()
  callback(new Error("Late RTL failure"))
  mocks.events.get("style.load")!()
  expect(options.onResourceError).toHaveBeenCalledTimes(1)
  expect(mocks.labels).not.toHaveBeenCalled()
})
