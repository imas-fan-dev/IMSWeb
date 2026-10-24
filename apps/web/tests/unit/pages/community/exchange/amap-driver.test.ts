import { expect, it, vi } from "vitest"
import {
  loadAMapSdk,
  type AMapSdk,
  type AMapDistrictLayer,
} from "~/pages/community/exchange/amap-sdk"
import { createAMapDriver } from "~/pages/community/exchange/amap-driver"

vi.mock("~/pages/community/exchange/amap-sdk", () => ({ loadAMapSdk: vi.fn() }))
vi.mock("~/lib/app-target", () => ({ IS_APP_TARGET: false }))

const config = {
  provider: "amap" as const,
  apiKey: "public-key-1234567890",
  securityProxyUrl: "/_AMapService",
  mapStyle: "amap://styles/normal",
}

function fixture() {
  const focus = vi.fn(),
    destroy = vi.fn(),
    setZooms = vi.fn(),
    markerOptions = vi.fn()
  const sdk: AMapSdk = {
    Map: class {
      on(event: string, callback: () => void) {
        if (event === "complete") queueMicrotask(callback)
      }
      getCenter() {
        return { getLng: () => 121.505, getLat: () => 31.197 }
      }
      getBounds() {
        return {
          getSouthWest: () => this.getCenter(),
          getNorthEast: () => this.getCenter(),
        }
      }
      getZoom() {
        return 18
      }
      getZooms(): [number, number] {
        return [2, 20]
      }
      setZooms = setZooms
      lngLatToContainer() {
        return { getX: () => 100, getY: () => 200 }
      }
      setZoomAndCenter = focus
      panBy() {}
      add() {}
      destroy = destroy
    },
    Marker: class {
      constructor(options: unknown) {
        markerOptions(options)
      }
      setMap() {}
    },
    convertFrom: vi.fn<AMapSdk["convertFrom"]>((points, _type, callback) =>
      callback("complete", {
        info: "ok",
        locations: points.map(([lng, lat]) => ({
          getLng: () => lng + 0.005,
          getLat: () => lat - 0.003,
        })),
      })
    ),
  }
  vi.mocked(loadAMapSdk).mockResolvedValue(sdk)
  const open = (presentation?: Parameters<typeof createAMapDriver>[1]) =>
    createAMapDriver(config, presentation).open(document.createElement("div"), {
      viewport: { center: [121.5, 31.2], zoom: 18 },
      minZoom: 2.3,
      signal: new AbortController().signal,
      onChange: vi.fn(),
      onResourceError: vi.fn(),
    })
  return { sdk, focus, destroy, setZooms, open, markerOptions }
}

function themeLayers(sdk: AMapSdk) {
  const attach = vi.fn<AMapDistrictLayer["setMap"]>()
  sdk.DistrictLayer = {
    Country: class {
      setMap = attach
      setStyles = vi.fn()
    },
  }
  return attach
}

it("detaches border and presentation layers before destroying the native map, once", async () => {
  const test = fixture()
  const attach = themeLayers(test.sdk)
  const removePresentation = vi.fn()
  const view = await test.open({
    zoomOffset: 1,
    install: () => removePresentation,
  })
  expect(attach).toHaveBeenCalledTimes(2)
  view.destroy()
  view.destroy()
  expect(attach.mock.calls.filter(([map]) => map === null)).toHaveLength(2)
  expect(removePresentation).toHaveBeenCalledTimes(1)
  expect(test.destroy).toHaveBeenCalledTimes(1)
  expect(attach.mock.invocationCallOrder.at(-1)).toBeLessThan(
    test.destroy.mock.invocationCallOrder[0]!
  )
  expect(removePresentation.mock.invocationCallOrder[0]).toBeLessThan(
    test.destroy.mock.invocationCallOrder[0]!
  )
})

it("does not attach a late border plugin to a closed native map", async () => {
  const test = fixture()
  const plugin = vi.fn<NonNullable<AMapSdk["plugin"]>>()
  test.sdk.plugin = plugin
  const view = await test.open()
  view.destroy()
  const attach = themeLayers(test.sdk)
  plugin.mock.calls[0]![1]()
  expect(attach).not.toHaveBeenCalled()
  expect(test.destroy).toHaveBeenCalledTimes(1)
})

it("attaches a loaded border plugin once and releases it on close", async () => {
  const test = fixture()
  const plugin = vi.fn<NonNullable<AMapSdk["plugin"]>>()
  test.sdk.plugin = plugin
  const view = await test.open()
  const attach = themeLayers(test.sdk)
  const complete = plugin.mock.calls[0]![1]
  complete()
  complete()
  expect(attach).toHaveBeenCalledTimes(2)
  view.destroy()
  expect(attach.mock.calls.filter(([map]) => map === null)).toHaveLength(2)
})

it("cleans up the border theme when presentation setup fails", async () => {
  const test = fixture()
  const attach = themeLayers(test.sdk)
  await expect(
    test.open({
      zoomOffset: 1,
      install() {
        throw new Error("presentation rejected")
      },
    })
  ).rejects.toThrow("presentation rejected")
  expect(attach.mock.calls.filter(([map]) => map === null)).toHaveLength(2)
  expect(test.destroy).toHaveBeenCalledTimes(1)
})

it("keeps the native map usable when the optional border plugin fails", async () => {
  const test = fixture()
  test.sdk.plugin = () => {
    throw new Error("plugin unavailable")
  }
  const view = await test.open()
  expect(view.read().zoom).toBe(18)
  expect(test.destroy).not.toHaveBeenCalled()
  view.destroy()
  expect(test.destroy).toHaveBeenCalledTimes(1)
})

it("releases both border layers even when one SDK detach fails", async () => {
  const test = fixture()
  const attach = themeLayers(test.sdk)
  const view = await test.open()
  attach.mockImplementation((map) => {
    if (map === null) throw new Error("already disposed")
  })
  view.destroy()
  expect(attach.mock.calls.filter(([map]) => map === null)).toHaveLength(2)
  expect(test.destroy).toHaveBeenCalledTimes(1)
})

it("keeps the latest camera intent when conversions finish out of order and honors canceled selection", async () => {
  const test = fixture()
  const view = await test.open()
  const pending = new Map<number, Parameters<AMapSdk["convertFrom"]>[2]>()
  vi.mocked(test.sdk.convertFrom).mockImplementation(
    (points, _type, callback) => {
      pending.set(points[0]![0], callback)
    }
  )
  const first = view.focus([130, 30], { zoom: 13, duration: 0 })
  const second = view.focus([140, 40], { zoom: 14, duration: 0 })
  pending.get(140)!("complete", {
    info: "ok",
    locations: [{ getLng: () => 140.005, getLat: () => 39.997 }],
  })
  await second
  pending.get(130)!("complete", {
    info: "ok",
    locations: [{ getLng: () => 130.005, getLat: () => 29.997 }],
  })
  await first
  expect(test.focus).toHaveBeenCalledExactlyOnceWith(
    14,
    [140.005, 39.997],
    true,
    0
  )
  const controller = new AbortController()
  const canceled = view.focus([150, 30], {
    zoom: 15,
    duration: 0,
    signal: controller.signal,
  })
  controller.abort()
  pending.get(150)!("complete", {
    info: "ok",
    locations: [{ getLng: () => 150.005, getLat: () => 29.997 }],
  })
  await canceled
  expect(test.focus).toHaveBeenCalledTimes(1)
  view.destroy()
})

it("owns the native map before configuring its zoom range and disposes failed setup once", async () => {
  const test = fixture()
  test.setZooms.mockImplementationOnce(() => {
    throw new Error("setup rejected")
  })
  await expect(test.open()).rejects.toThrow("setup rejected")
  expect(test.destroy).toHaveBeenCalledTimes(1)
})

it("uses native search coordinates unchanged, while canonical search and offices still convert from WGS84", async () => {
  const test = fixture()
  const view = await test.open()
  vi.mocked(test.sdk.convertFrom).mockClear()
  const target = {
    kind: "native" as const,
    provider: "amap",
    position: [121.505, 31.197] as [number, number],
  }
  const marker = await view.addSearchMarker({
    target,
    element: document.createElement("div"),
    anchor: "center",
  })
  await view.focusSearch(target, { zoom: 13, duration: 0 })
  expect(test.sdk.convertFrom).not.toHaveBeenCalled()
  expect(test.markerOptions).toHaveBeenCalledWith(
    expect.objectContaining({ position: target.position })
  )
  expect(test.focus).toHaveBeenLastCalledWith(13, target.position, true, 0)
  await view.focusSearch(
    { kind: "wgs84", position: [122, 30] },
    { zoom: 13, duration: 0 }
  )
  expect(test.sdk.convertFrom).toHaveBeenCalledOnce()
  expect(test.focus).toHaveBeenLastCalledWith(13, [122.005, 29.997], true, 0)
  await expect(
    view.focusSearch(
      { ...target, provider: "other" },
      { zoom: 13, duration: 0 }
    )
  ).rejects.toMatchObject({ kind: "unavailable" })
  marker.remove()
  view.destroy()
})
