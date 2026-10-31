import { expect, it, vi } from "vitest"
import { reverseAMapPosition } from "~/pages/community/exchange/maps/amap/reverse-geocode"
import type { AMapSdk } from "~/pages/community/exchange/maps/amap/sdk"
import type { MapPosition } from "~/lib/maps/map-engine"

function fixture() {
  let respond!: (status: string, result: unknown) => void
  const getAddress = vi.fn((_point: MapPosition, callback: typeof respond) => {
    respond = callback
  })
  const options = vi.fn()
  const sdk: Pick<AMapSdk, "Geocoder" | "plugin"> = {
    Geocoder: class {
      constructor(value: unknown) {
        options(value)
      }
      getAddress = getAddress
    },
  }
  return {
    sdk,
    getAddress,
    options,
    respond: (status: string, result: unknown) => respond(status, result),
  }
}

it("binds the provider's detailed street address to the original confirmed WGS84 pin", async () => {
  const test = fixture()
  const native: MapPosition = [104.045, 30.55]
  const confirmed: MapPosition = [104.0425, 30.552616]
  const pending = reverseAMapPosition(
    test.sdk,
    native,
    confirmed,
    new AbortController().signal
  )
  expect(test.getAddress).toHaveBeenCalledWith(native, expect.any(Function))
  expect(test.options).toHaveBeenCalledWith({ radius: 1000, extensions: "all" })
  test.getAddress.mock.calls[0]![0][0] = 0
  confirmed[0] = 0
  expect(native).toEqual([104.045, 30.55])
  test.respond("complete", {
    regeocode: {
      formattedAddress: "四川省成都市武侯区天府二街999号",
      addressComponent: {
        province: "四川省",
        city: "成都市",
        district: "武侯区",
      },
    },
  })
  await expect(pending).resolves.toMatchObject({
    place: {
      city: "成都市",
      address: "四川省成都市武侯区天府二街999号",
      location: {
        longitude: 104.0425,
        latitude: 30.552616,
        precision: "exact",
      },
    },
    attribution: { text: "© 高德地图", url: "https://www.amap.com/" },
  })
})

it("handles municipality city arrays and preserves available street and house-number data", async () => {
  const test = fixture()
  const pending = reverseAMapPosition(
    test.sdk,
    [116.41, 39.91],
    [116.4, 39.9],
    new AbortController().signal
  )
  test.respond("complete", {
    regeocode: {
      addressComponent: {
        province: "北京市",
        city: [],
        district: "石景山区",
        streetNumber: { street: "石景山路", number: "1号" },
      },
    },
  })
  await expect(pending).resolves.toMatchObject({
    place: { city: "北京市", address: "北京市石景山区石景山路1号" },
  })
})

it("loads the Geocoder plugin without issuing requests after cancellation", async () => {
  const test = fixture()
  let loaded!: () => void
  const plugin = vi.fn((_names: string[], callback: () => void) => {
    loaded = callback
  })
  const sdk: Pick<AMapSdk, "Geocoder" | "plugin"> = { plugin }
  const controller = new AbortController()
  const pending = reverseAMapPosition(
    sdk,
    [104, 30],
    [103.9, 29.9],
    controller.signal
  )
  expect(plugin).toHaveBeenCalledWith(["AMap.Geocoder"], expect.any(Function))
  controller.abort()
  await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  sdk.Geocoder = test.sdk.Geocoder
  loaded()
  expect(test.getAddress).not.toHaveBeenCalled()
})

it("uses a province-administered county-level city when the provider's city field is empty", async () => {
  const test = fixture()
  const pending = reverseAMapPosition(
    test.sdk,
    [110.8, 19.6],
    [110.79, 19.59],
    new AbortController().signal
  )
  test.respond("complete", {
    regeocode: {
      formattedAddress: "海南省文昌市文航路1号",
      addressComponent: { province: "海南省", city: [], district: "文昌市" },
    },
  })
  await expect(pending).resolves.toMatchObject({
    place: { city: "文昌市", address: "海南省文昌市文航路1号" },
  })
})

it("ignores a late result for a cancelled pin", async () => {
  const test = fixture()
  const controller = new AbortController()
  const pending = reverseAMapPosition(
    test.sdk,
    [104, 30],
    [103.9, 29.9],
    controller.signal
  )
  controller.abort()
  await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  test.respond("complete", {
    regeocode: {
      formattedAddress: "旧位置地址",
      addressComponent: { city: "旧城市" },
    },
  })
})

it.each(["error", "no_data"])(
  "does not manufacture an address when provider returns %s",
  async (status) => {
    const test = fixture()
    const pending = reverseAMapPosition(
      test.sdk,
      [104, 30],
      [103.9, 29.9],
      new AbortController().signal
    )
    test.respond(status, {})
    if (status === "no_data")
      await expect(pending).resolves.toMatchObject({ place: null })
    else await expect(pending).rejects.toMatchObject({ kind: "failed" })
  }
)
