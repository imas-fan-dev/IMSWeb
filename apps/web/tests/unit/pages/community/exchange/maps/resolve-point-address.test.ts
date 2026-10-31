import { beforeEach, expect, it, vi } from "vitest"
import type { FudabaMapConfig } from "~/lib/api"
import { createPointAddressResolver } from "~/pages/community/exchange/maps/resolve-point-address"

const mocks = vi.hoisted(() => ({
  classify: vi.fn(),
  reverseNative: vi.fn(),
  loadSdk: vi.fn(),
  convert: vi.fn(),
  reverse: vi.fn(),
  send: vi.fn(),
}))
vi.mock("~/lib/api", () => ({
  reverseFudabaPlace: mocks.reverse,
  sendWithAbort: mocks.send,
}))
vi.mock("~/pages/community/exchange/maps/regional/resolve-point", () => ({
  createRegionPointResolver: () => mocks.classify,
}))
vi.mock("~/pages/community/exchange/maps/amap/reverse-geocode", () => ({
  reverseAMapPosition: mocks.reverseNative,
}))
vi.mock("~/pages/community/exchange/maps/amap/sdk", () => ({
  loadAMapSdk: mocks.loadSdk,
}))
vi.mock("~/pages/community/exchange/maps/amap/coordinates", () => ({
  convertAMapPositions: mocks.convert,
}))

const amap = {
  provider: "amap" as const,
  apiKey: "test-amap-key",
  securityProxyUrl: "/_AMapService",
  mapStyle: "amap://styles/normal",
}
const config: FudabaMapConfig = {
  provider: "regional",
  defaultRegion: "mainland",
  mainland: amap,
  overseas: {
    provider: "mapbox",
    accessToken: "test-mapbox-token",
    styleUrl: "mapbox://styles/mapbox/streets-v12",
  },
  search: {
    provider: "federated",
    mainland: amap,
    overseas: { provider: "mapbox", accessToken: "test-mapbox-token" },
  },
}
const result = { place: null, attribution: null }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.reverseNative.mockResolvedValue(result)
  mocks.send.mockResolvedValue(result)
  mocks.reverse.mockReturnValue("backend-method")
  mocks.loadSdk.mockResolvedValue({})
  mocks.convert.mockResolvedValue([[104.045, 30.55]])
})

it("uses the mainland provider's detailed reverse lookup and never the unrelated coarse Mapbox address", async () => {
  const sdk = {}
  const native = [104.045, 30.55]
  mocks.classify.mockResolvedValue({
    region: "mainland",
    sdk,
    nativePosition: native,
  })
  const signal = new AbortController().signal
  await expect(
    createPointAddressResolver(config)([104.0425, 30.552616], signal)
  ).resolves.toBe(result)
  expect(mocks.reverseNative).toHaveBeenCalledExactlyOnceWith(
    sdk,
    native,
    [104.0425, 30.552616],
    signal
  )
  expect(mocks.reverse).not.toHaveBeenCalled()
})

it("uses canonical backend lookup for overseas points", async () => {
  mocks.classify.mockResolvedValue({ region: "overseas" })
  const signal = new AbortController().signal
  await createPointAddressResolver(config)([139.7, 35.6], signal)
  expect(mocks.reverse).toHaveBeenCalledExactlyOnceWith({
    longitude: 139.7,
    latitude: 35.6,
  })
  expect(mocks.send).toHaveBeenCalledWith("backend-method", signal)
  expect(mocks.reverseNative).not.toHaveBeenCalled()
})

it("converts a canonical point once before native AMap lookup without changing the saved point", async () => {
  const sdk = {}
  mocks.loadSdk.mockResolvedValue(sdk)
  const signal = new AbortController().signal
  await createPointAddressResolver({
    ...amap,
    search: {
      provider: "amap",
      apiKey: amap.apiKey,
      securityProxyUrl: amap.securityProxyUrl,
    },
  })([104.0425, 30.552616], signal)
  expect(mocks.convert).toHaveBeenCalledExactlyOnceWith(sdk, [
    [104.0425, 30.552616],
  ])
  expect(mocks.reverseNative).toHaveBeenCalledWith(
    sdk,
    [104.045, 30.55],
    [104.0425, 30.552616],
    signal
  )
})

it("does not fall back to another provider after mainland lookup fails", async () => {
  mocks.classify.mockResolvedValue({
    region: "mainland",
    sdk: {},
    nativePosition: [104, 30],
  })
  mocks.reverseNative.mockRejectedValueOnce(new Error("provider failed"))
  await expect(
    createPointAddressResolver(config)([104, 30], new AbortController().signal)
  ).rejects.toThrow("provider failed")
  expect(mocks.reverse).not.toHaveBeenCalled()
})

it("snapshots the selected point before asynchronous classification", async () => {
  let classified!: (value: {
    region: "mainland"
    sdk: object
    nativePosition: [number, number]
  }) => void
  mocks.classify.mockReturnValue(
    new Promise((resolve) => {
      classified = resolve
    })
  )
  const point: [number, number] = [104.0425, 30.552616]
  const pending = createPointAddressResolver(config)(
    point,
    new AbortController().signal
  )
  point[0] = 0
  classified({ region: "mainland", sdk: {}, nativePosition: [104.045, 30.55] })
  await pending
  expect(mocks.reverseNative.mock.calls[0]?.[2]).toEqual([104.0425, 30.552616])
})
