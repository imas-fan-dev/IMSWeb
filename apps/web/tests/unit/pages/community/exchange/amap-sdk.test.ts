import { afterEach, expect, it, vi } from "vitest"

vi.mock("~/lib/api", () => ({
  resolveMapTransportOrigin: () => "https://api.ims.test",
}))
const config = {
  provider: "amap" as const,
  apiKey: "public-key-1234567890",
  securityProxyUrl: "/_AMapService",
  mapStyle: "amap://styles/normal",
}

afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
  document
    .querySelectorAll('script[src*="webapi.amap.com"]')
    .forEach((script) => script.remove())
  Reflect.deleteProperty(window, "AMap")
  Reflect.deleteProperty(window, "_AMapSecurityConfig")
  Object.keys(window)
    .filter((name) => name.startsWith("__imsAMapReady"))
    .forEach((name) => Reflect.deleteProperty(window, name))
})

it("sets the App/API proxy before loading once and rejects conflicting credentials", async () => {
  const { loadAMapSdk } = await import("~/pages/community/exchange/amap-sdk")
  const promise = loadAMapSdk(config)
  expect(Reflect.get(window, "_AMapSecurityConfig")).toEqual({
    serviceHost: "https://api.ims.test/_AMapService",
  })
  expect(loadAMapSdk(config)).toBe(promise)
  const script = document.querySelector<HTMLScriptElement>(
    'script[src*="webapi.amap.com"]'
  )!
  expect(new URL(script.src).searchParams.get("key")).toBe(config.apiKey)
  const sdk = { Map: class {}, Marker: class {}, convertFrom: () => {} }
  Reflect.set(window, "AMap", sdk)
  const callback = new URL(script.src).searchParams.get("callback")!
  Reflect.get(window, callback)()
  await expect(promise).resolves.toBe(sdk)
  await expect(
    loadAMapSdk({ ...config, apiKey: "another-public-key-1234" })
  ).rejects.toThrow("请刷新页面")
})

it("cleans a failed script so a subsequent request can retry", async () => {
  const { loadAMapSdk } = await import("~/pages/community/exchange/amap-sdk")
  const promise = loadAMapSdk(config)
  const rejection = expect(promise).rejects.toThrow("加载失败")
  document
    .querySelector('script[src*="webapi.amap.com"]')!
    .dispatchEvent(new Event("error"))
  await rejection
  const retry = loadAMapSdk(config)
  const retryRejection = expect(retry).rejects.toThrow("加载失败")
  document
    .querySelector('script[src*="webapi.amap.com"]')!
    .dispatchEvent(new Event("error"))
  await retryRejection
})

it.each([
  ["amap://styles/normal", "amap://styles/whitesmoke"],
  ["amap://styles/custom-portal-theme", "amap://styles/custom-portal-theme"],
])(
  "preserves native zoom limits and resolves the theme for %s",
  async (mapStyle, expectedStyle) => {
    const { createAMapDriver } =
      await import("~/pages/community/exchange/amap-driver")
    const controller = new AbortController()
    const promise = createAMapDriver({ ...config, mapStyle }).open(
      document.createElement("div"),
      {
        viewport: { center: [121.5, 31.2], zoom: 18 },
        minZoom: 2.3,
        signal: controller.signal,
        onChange: vi.fn(),
        onResourceError: vi.fn(),
      }
    )
    const nativeOptions = vi.fn()
    const setZooms = vi.fn()
    const nativeFocus = vi.fn()
    const removed = vi.fn()
    const destroyed = vi.fn()
    Reflect.set(window, "AMap", {
      Map: class {
        constructor(_container: HTMLDivElement, options: unknown) {
          nativeOptions(options)
        }
        getZooms() {
          return [2, 20]
        }
        on(event: string, callback: () => void) {
          if (event === "complete") queueMicrotask(callback)
        }
        getBounds() {
          return {
            getSouthWest: () => ({ getLng: () => 115, getLat: () => 30 }),
            getNorthEast: () => ({ getLng: () => 125, getLat: () => 40 }),
          }
        }
        getZoom() {
          return 18
        }
        lngLatToContainer() {
          return { getX: () => 100, getY: () => 200 }
        }
        setZoomAndCenter = nativeFocus
        destroy = destroyed
        setZooms = setZooms
      },
      Marker: class {
        setMap = removed
      },
      convertFrom: (
        points: [number, number][],
        _type: string,
        callback: (status: string, result: unknown) => void
      ) =>
        callback("complete", {
          info: "ok",
          locations: points.map(([lng, lat]) => ({
            getLng: () => lng + 0.005,
            getLat: () => lat - 0.003,
          })),
        }),
    })
    const script = document.querySelector<HTMLScriptElement>(
      'script[src*="webapi.amap.com"]'
    )!
    Reflect.get(window, new URL(script.src).searchParams.get("callback")!)()
    const view = await promise
    expect(nativeOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        zoom: 18,
        center: [121.505, 31.197],
        mapStyle: expectedStyle,
      })
    )
    expect(nativeOptions.mock.calls[0]![0]).not.toHaveProperty("zooms")
    expect(setZooms).toHaveBeenCalledWith([2.3, 20])
    expect(view.read()).toEqual({
      zoom: 18,
      bounds: { west: 114.98, south: 29.98, east: 125.02, north: 40.02 },
    })
    await expect(view.project([[121.5, 31.2]])).resolves.toEqual([
      { x: 100, y: 200 },
    ])
    await view.focus([121.5, 31.2], { zoom: 19, duration: 0 })
    expect(nativeFocus).toHaveBeenCalledWith(19, [121.505, 31.197], true, 0)
    await view.addMarker({
      position: [121.5, 31.2],
      element: document.createElement("button"),
      anchor: "bottom",
    })
    controller.abort()
    view.destroy()
    expect(removed).toHaveBeenCalledExactlyOnceWith(null)
    expect(destroyed).toHaveBeenCalledTimes(1)
    await expect(view.project([[121.5, 31.2]])).rejects.toMatchObject({
      name: "AbortError",
    })
  }
)

it("explains rejected website authorization without exposing SDK credential fields", async () => {
  const { loadAMapSdk } = await import("~/pages/community/exchange/amap-sdk")
  const promise = loadAMapSdk(config)
  const rejection = expect(promise).rejects.toThrow(
    "高德地图未授权当前网站，请联系管理员检查域名白名单。"
  )
  const script = document.querySelector<HTMLScriptElement>(
    'script[src*="webapi.amap.com"]'
  )!
  const callback = new URL(script.src).searchParams.get("callback")!
  Reflect.get(
    window,
    callback
  )({
    info: "INVALID_USER_DOMAIN",
    infocode: "10006",
    key: "private-sdk-key",
    sec_code: "private-sdk-code",
  })
  await rejection
  expect(document.querySelector('script[src*="webapi.amap.com"]')).toBeNull()
})

it("does not construct a native map after its initial coordinate conversion is aborted", async () => {
  const { createAMapDriver } =
    await import("~/pages/community/exchange/amap-driver")
  const controller = new AbortController()
  const pending = createAMapDriver(config).open(document.createElement("div"), {
    viewport: { center: [121.5, 31.2], zoom: 18 },
    minZoom: 2.3,
    signal: controller.signal,
    onChange: vi.fn(),
    onResourceError: vi.fn(),
  })
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" })
  const nativeMap = vi.fn()
  let finish!: (status: string, result: unknown) => void
  Reflect.set(window, "AMap", {
    Map: nativeMap,
    Marker: class {},
    convertFrom: (
      _points: unknown,
      _type: unknown,
      callback: typeof finish
    ) => {
      finish = callback
    },
  })
  const script = document.querySelector<HTMLScriptElement>(
    'script[src*="webapi.amap.com"]'
  )!
  Reflect.get(window, new URL(script.src).searchParams.get("callback")!)()
  await Promise.resolve()
  expect(finish).toBeTypeOf("function")
  controller.abort()
  finish("complete", {
    info: "ok",
    locations: [{ getLng: () => 121.505, getLat: () => 31.197 }],
  })
  await rejected
  expect(nativeMap).not.toHaveBeenCalled()
})

it("fails boundedly if the SDK never finishes loading", async () => {
  vi.useFakeTimers()
  const { loadAMapSdk } = await import("~/pages/community/exchange/amap-sdk")
  const promise = loadAMapSdk(config)
  const rejection = expect(promise).rejects.toThrow("加载超时")
  await vi.advanceTimersByTimeAsync(20000)
  await rejection
  expect(document.querySelector('script[src*="webapi.amap.com"]')).toBeNull()
})

it("recovers a late official callback after timeout for the same credentials", async () => {
  vi.useFakeTimers()
  const { loadAMapSdk } = await import("~/pages/community/exchange/amap-sdk")
  const promise = loadAMapSdk(config)
  const script = document.querySelector<HTMLScriptElement>(
    'script[src*="webapi.amap.com"]'
  )!
  const callback = new URL(script.src).searchParams.get("callback")!
  const rejection = expect(promise).rejects.toThrow("加载超时")
  await vi.advanceTimersByTimeAsync(20000)
  await rejection
  const sdk = { Map: class {}, Marker: class {}, convertFrom: () => {} }
  Reflect.set(window, "AMap", sdk)
  Reflect.get(window, callback)()
  await expect(loadAMapSdk(config)).resolves.toBe(sdk)
})
