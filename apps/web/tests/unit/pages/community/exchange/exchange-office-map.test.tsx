import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { StyleSpecification } from "maplibre-gl"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GeolocationFailure } from "~/lib/geolocation"
import { ExchangeOfficeMap } from "~/pages/community/exchange/exchange-office-map"

const geolocationMocks = vi.hoisted(() => ({
  getCurrentCoordinates: vi.fn(),
}))

const maplibreMocks = vi.hoisted(() => {
  const instances: MapMock[] = []
  const markerInstances: MarkerMock[] = []

  class GeoJSONSourceMock {
    setData = vi.fn()
    getClusterExpansionZoom = vi.fn(async () => 8)
  }

  class MapMock {
    options: { center: [number, number]; zoom: number }
    center: [number, number]
    zoom: number
    touchZoomRotate = { disableRotation: vi.fn() }
    keyboard = { disableRotation: vi.fn() }
    addControl = vi.fn()
    getSource = vi.fn(() => null)
    on = vi.fn()
    off = vi.fn()
    setStyle = vi.fn()
    easeTo = vi.fn()
    resize = vi.fn()
    remove = vi.fn()

    constructor(options: { center: [number, number]; zoom: number }) {
      this.options = options
      this.center = [...options.center]
      this.zoom = options.zoom
      instances.push(this)
    }

    getCenter() {
      return { lng: this.center[0], lat: this.center[1] }
    }

    getZoom() {
      return this.zoom
    }
  }

  class MarkerMock {
    setLngLat = vi.fn(() => this)
    addTo = vi.fn(() => this)
    remove = vi.fn()

    constructor() {
      markerInstances.push(this)
    }

    getElement() {
      return document.createElement("button")
    }
  }

  return {
    GeoJSONSourceMock,
    MapMock,
    MarkerMock,
    instances,
    markerInstances,
  }
})

vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))
vi.mock("~/lib/geolocation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/geolocation")>()),
  getCurrentCoordinates: geolocationMocks.getCurrentCoordinates,
}))
vi.mock("~/lib/api", () => ({
  getFudabaChinaBoundaryDashSource: () => ({
    send: async () => ({ type: "FeatureCollection", features: [] }),
  }),
  resolveMapTransportOrigin: () => "https://ims.test",
}))
vi.mock("~/pages/community/exchange/exchange-boundary-compliance", () => ({
  applyChinaBoundaryCompliance: vi.fn(),
  CHINA_CLAIM_BOUNDARY_LAYER_ID: "china-claim-boundary",
  CHINA_DASH_FILL_LAYER_ID: "china-dash-fill",
  CHINA_DASH_LINE_LAYER_ID: "china-dash-line",
  CHINA_DASH_SOURCE_URL: "/maps/china-boundary-dashes.json",
  TAIWAN_PROVINCE_LABEL_LAYER_ID: "taiwan-label",
}))
vi.mock("maplibre-gl/dist/maplibre-gl-csp-worker.js?url", () => ({
  default: "/maplibre-worker.js",
}))
vi.mock("pmtiles", () => ({
  Protocol: class ProtocolMock {
    tile = vi.fn()
  },
}))
vi.mock("maplibre-gl", () => ({
  addProtocol: vi.fn(),
  AttributionControl: class AttributionControlMock {},
  GeoJSONSource: maplibreMocks.GeoJSONSourceMock,
  Map: maplibreMocks.MapMock,
  Marker: maplibreMocks.MarkerMock,
  NavigationControl: class NavigationControlMock {},
  setWorkerUrl: vi.fn(),
}))

const mapProps = {
  styleUrl: "/maps/exchange-style.json",
  groups: [],
  selectedGroupKey: null,
  onSelectGroup: vi.fn(),
  onViewportChange: vi.fn(),
  onFatalError: vi.fn(),
}

describe("ExchangeOfficeMap App viewport memory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    geolocationMocks.getCurrentCoordinates.mockResolvedValue({
      longitude: 121.473701,
      latitude: 31.230416,
    })
    window.sessionStorage.clear()
    maplibreMocks.instances.length = 0
    maplibreMocks.markerInstances.length = 0
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (() => ({})) as unknown as typeof HTMLCanvasElement.prototype.getContext
    )
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserverMock {
        observe = vi.fn()
        disconnect = vi.fn()
        unobserve = vi.fn()
      }
    )
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    )
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("restores center and zoom after the map route remounts", () => {
    const firstRoute = render(<ExchangeOfficeMap {...mapProps} />)
    const firstMap = maplibreMocks.instances[0]

    expect(firstMap?.options).toMatchObject({
      center: [127.1, 31.2],
      zoom: 4.05,
    })

    if (!firstMap) throw new Error("地图实例未创建")
    firstMap.center = [121.473701, 31.230416]
    firstMap.zoom = 8.125
    firstRoute.unmount()

    render(<ExchangeOfficeMap {...mapProps} />)

    expect(maplibreMocks.instances[1]?.options).toMatchObject({
      center: [121.473701, 31.230416],
      zoom: 8.125,
    })
  })

  it("applies the portal palette before MapLibre receives the first style", () => {
    render(<ExchangeOfficeMap {...mapProps} />)
    const map = maplibreMocks.instances[0]
    if (!map) throw new Error("地图实例未创建")

    const styleOptions = map.setStyle.mock.calls[0]?.[1] as
      | {
          transformStyle: (
            previousStyle: StyleSpecification | undefined,
            nextStyle: StyleSpecification
          ) => StyleSpecification
        }
      | undefined
    if (!styleOptions) throw new Error("地图样式变换未配置")

    const transformed = styleOptions.transformStyle(undefined, {
      version: 8,
      sources: {},
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#111111" },
        },
      ],
    })

    expect(transformed.layers[0]).toMatchObject({
      id: "background",
      paint: { "background-color": "#edf3f8" },
    })
  })

  it("animates back to the current user location", async () => {
    const user = userEvent.setup()

    render(<ExchangeOfficeMap {...mapProps} />)
    await user.click(screen.getByRole("button", { name: "回到我的位置" }))

    expect(geolocationMocks.getCurrentCoordinates).toHaveBeenCalledOnce()
    const map = maplibreMocks.instances[0]
    expect(map?.easeTo).toHaveBeenCalledWith({
      center: [121.473701, 31.230416],
      zoom: 8,
      duration: 900,
      essential: false,
    })
    expect(maplibreMocks.markerInstances).toHaveLength(1)
    expect(
      maplibreMocks.markerInstances[0]?.setLngLat
    ).toHaveBeenLastCalledWith([121.473701, 31.230416])
    expect(maplibreMocks.markerInstances[0]?.addTo).toHaveBeenCalledWith(map)
    expect(screen.getByText("已回到您的位置")).toHaveClass("sr-only")
  })

  it("reuses the location marker and avoids animation for reduced motion", async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true }))
    )
    geolocationMocks.getCurrentCoordinates
      .mockResolvedValueOnce({ longitude: 121.473701, latitude: 31.230416 })
      .mockResolvedValueOnce({ longitude: 116.4074, latitude: 39.9042 })

    render(<ExchangeOfficeMap {...mapProps} />)
    const locationButton = screen.getByRole("button", {
      name: "回到我的位置",
    })
    await user.click(locationButton)
    await user.click(locationButton)

    expect(maplibreMocks.markerInstances).toHaveLength(1)
    expect(
      maplibreMocks.markerInstances[0]?.setLngLat
    ).toHaveBeenLastCalledWith([116.4074, 39.9042])
    expect(maplibreMocks.instances[0]?.easeTo).toHaveBeenLastCalledWith({
      center: [116.4074, 39.9042],
      zoom: 8,
      duration: 0,
      essential: false,
    })
  })

  it.each([
    ["permission-denied", "未获得位置权限"],
    ["timeout", "获取位置超时，请重试"],
    ["unavailable", "暂时无法获取您的位置"],
    ["unsupported", "当前设备不支持位置服务"],
  ] as const)("shows the %s location failure", async (kind, message) => {
    const user = userEvent.setup()
    geolocationMocks.getCurrentCoordinates.mockRejectedValue(
      new GeolocationFailure(kind)
    )

    render(<ExchangeOfficeMap {...mapProps} />)
    await user.click(screen.getByRole("button", { name: "回到我的位置" }))

    expect(await screen.findByText(message)).toBeVisible()
    expect(maplibreMocks.instances[0]?.easeTo).not.toHaveBeenCalled()
  })

  it("ignores a location result after the map is unmounted", async () => {
    const user = userEvent.setup()
    let resolveCoordinates: (coordinates: {
      longitude: number
      latitude: number
    }) => void = () => undefined
    geolocationMocks.getCurrentCoordinates.mockReturnValue(
      new Promise((resolve) => {
        resolveCoordinates = resolve
      })
    )

    const route = render(<ExchangeOfficeMap {...mapProps} />)
    await user.click(screen.getByRole("button", { name: "回到我的位置" }))
    const map = maplibreMocks.instances[0]
    route.unmount()

    await act(async () => {
      resolveCoordinates({ longitude: 116.4074, latitude: 39.9042 })
    })

    expect(map?.easeTo).not.toHaveBeenCalled()
  })

  it("invalidates an in-flight location request when the map style changes", async () => {
    const user = userEvent.setup()
    let resolveCoordinates: (coordinates: {
      longitude: number
      latitude: number
    }) => void = () => undefined
    geolocationMocks.getCurrentCoordinates.mockReturnValue(
      new Promise((resolve) => {
        resolveCoordinates = resolve
      })
    )

    const route = render(<ExchangeOfficeMap {...mapProps} />)
    const locationButton = screen.getByRole("button", {
      name: "回到我的位置",
    })
    await user.click(locationButton)
    expect(locationButton).toBeDisabled()

    route.rerender(
      <ExchangeOfficeMap {...mapProps} styleUrl="/maps/alternate-style.json" />
    )
    expect(locationButton).toBeEnabled()
    const oldMap = maplibreMocks.instances[0]

    await act(async () => {
      resolveCoordinates({ longitude: 116.4074, latitude: 39.9042 })
    })

    expect(oldMap?.easeTo).not.toHaveBeenCalled()
    expect(maplibreMocks.instances[1]?.easeTo).not.toHaveBeenCalled()
    expect(screen.queryByText("已回到您的位置")).not.toBeInTheDocument()
  })
})
