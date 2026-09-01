import { render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ExchangeOfficeMap } from "~/pages/community/exchange/exchange-office-map"

const maplibreMocks = vi.hoisted(() => {
  const instances: MapMock[] = []

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
    setLngLat() {
      return this
    }

    addTo() {
      return this
    }

    remove() {}

    getElement() {
      return document.createElement("button")
    }
  }

  return { GeoJSONSourceMock, MapMock, MarkerMock, instances }
})

vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: true }))
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
    window.sessionStorage.clear()
    maplibreMocks.instances.length = 0
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
})
