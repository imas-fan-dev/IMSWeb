import type { StyleSpecification } from "maplibre-gl"
import { describe, expect, it } from "vitest"

import type { FudabaMapOffice, FudabaSeries } from "~/lib/api"
import {
  createMapDeliveryContext,
  groupMapOffices,
  mapDeliveryPrefixFromStyleUrl,
  mergeMapOfficeResponses,
  resolveAllowedMapResourceUrl,
  resolveMapStyleResourceUrls,
  resolveMapStyleUrl,
  splitViewportBounds,
} from "~/pages/community/exchange/exchange-map-model"

const office: FudabaMapOffice = {
  id: "office-1",
  slug: "shanghai-weekend",
  name: "上海周末交换事务所",
  city: "上海",
  address: "徐汇滨江公共活动区",
  accent: "#f34e6c",
  isOpen: true,
  seriesCodes: ["765"],
  location: {
    latitude: 31.2,
    longitude: 121.5,
    precision: "regional",
  },
}

const seriesCatalog: FudabaSeries[] = [
  {
    id: 1,
    code: "765",
    displayName: "765PRO",
    color: "#f34f6d",
    iconUrl: "/icon/agencies/1.webp",
    imageTransform: {
      fit: "contain",
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
      rotation: 0,
    },
    displayOrder: 0,
    activeOfficeCount: 1,
  },
  {
    id: 3,
    code: "cg",
    displayName: "灰姑娘女孩",
    color: "#2681c8",
    iconUrl: null,
    imageTransform: {
      fit: "contain",
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
      rotation: 0,
    },
    displayOrder: 2,
    activeOfficeCount: 1,
  },
  {
    id: 4,
    code: "ml",
    displayName: "百万现场",
    color: "#ffc30b",
    iconUrl: null,
    imageTransform: {
      fit: "contain",
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
      rotation: 0,
    },
    displayOrder: 3,
    activeOfficeCount: 0,
  },
  {
    id: 6,
    code: "sc",
    displayName: "闪耀色彩",
    color: "#8dbbff",
    iconUrl: null,
    imageTransform: {
      fit: "contain",
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
      rotation: 0,
    },
    displayOrder: 5,
    activeOfficeCount: 0,
  },
]

describe("exchange map model", () => {
  it("keeps URL resolution separate from the trusted origin set", () => {
    const scope = {
      base: "https://ims.test",
      trustedOrigins: ["https://ims.test"],
    }
    expect(
      resolveAllowedMapResourceUrl(
        "/api/community/exchange/map/style.json",
        scope
      )
    ).toBe("https://ims.test/api/community/exchange/map/style.json")
    expect(
      resolveAllowedMapResourceUrl(
        "https://ims.test/assets/map/tile.pbf",
        scope
      )
    ).toBe("https://ims.test/assets/map/tile.pbf")
    expect(
      resolveAllowedMapResourceUrl(
        "pmtiles:///maps/exchange/openfreemap-z0-11.pmtiles",
        scope
      )
    ).toBe("pmtiles://https://ims.test/maps/exchange/openfreemap-z0-11.pmtiles")
    expect(
      resolveAllowedMapResourceUrl(
        "pmtiles://https://ims.test/maps/exchange/openfreemap-z0-11.pmtiles/11/1715/836",
        scope
      )
    ).toBe(
      "pmtiles://https://ims.test/maps/exchange/openfreemap-z0-11.pmtiles/11/1715/836"
    )

    expect(() =>
      resolveAllowedMapResourceUrl("/maps/exchange/map.pmtiles", {
        base: "not a URL",
        trustedOrigins: ["https://ims.test"],
      })
    ).toThrow(/格式无效/)
    expect(() =>
      resolveAllowedMapResourceUrl("/maps/exchange/map.pmtiles", {
        base: "https://untrusted.test",
        trustedOrigins: ["https://ims.test"],
      })
    ).toThrow(/同源/)

    for (const resource of [
      "https://tiles.openfreemap.org/planet",
      "pmtiles://https://tiles.openfreemap.org/planet.pmtiles",
      "pmtiles://https://user@ims.test/maps/exchange/map.pmtiles",
      "data:application/json,%7B%7D",
      "mapbox://styles/example/style",
      "file:///tmp/map.json",
    ]) {
      expect(() => resolveAllowedMapResourceUrl(resource, scope)).toThrow(
        /同源/
      )
    }
  })

  it("keeps the default map delivery paths byte-identical", () => {
    const context = createMapDeliveryContext(
      "https://ims.test",
      "/maps/exchange-style.json",
      "https://ims.test"
    )
    expect(context).toEqual({
      deliveryPrefix: "/maps/",
      scope: {
        base: "https://ims.test",
        trustedOrigins: ["https://ims.test"],
      },
    })
    expect(mapDeliveryPrefixFromStyleUrl("/maps/exchange-style.json")).toBe(
      "/maps/"
    )
    expect(resolveMapStyleUrl("/maps/exchange-style.json", context)).toBe(
      "https://ims.test/maps/exchange-style.json"
    )

    const pathContext = createMapDeliveryContext(
      "https://ims.test",
      "/releases/map-v3/exchange-style.json",
      "https://ims.test"
    )
    expect(
      resolveMapStyleResourceUrls(
        {
          version: 8,
          sprite: "/maps/exchange/sprites/ofm",
          sources: {},
          layers: [],
        },
        pathContext
      ).sprite
    ).toBe("https://ims.test/releases/map-v3/exchange/sprites/ofm")
  })

  it("keeps packaged-App map resources on the trusted HTTP transport", () => {
    const context = createMapDeliveryContext(
      "https://site.imsweb.test",
      "/maps/exchange-style.json"
    )

    expect(context.scope).toEqual({
      base: "https://site.imsweb.test",
      trustedOrigins: ["https://site.imsweb.test"],
    })
    expect(
      resolveAllowedMapResourceUrl(
        "/maps/china-boundary-dashes.json",
        context.scope
      )
    ).toBe("https://site.imsweb.test/maps/china-boundary-dashes.json")
    expect(
      resolveMapStyleResourceUrls(
        {
          version: 8,
          sources: {
            openmaptiles: {
              type: "vector",
              url: "pmtiles:///maps/exchange/openfreemap-z0-11.pmtiles",
            },
          },
          layers: [],
        },
        context
      ).sources.openmaptiles
    ).toMatchObject({
      url: "pmtiles://https://site.imsweb.test/maps/exchange/openfreemap-z0-11.pmtiles",
    })
  })

  it("rewrites every style child onto an absolute host-and-path prefix", () => {
    const style: StyleSpecification = {
      version: 8,
      sprite: "/maps/exchange/sprites/ofm",
      glyphs: "/maps/exchange/fonts/{fontstack}/{range}.pbf",
      sources: {
        openmaptiles: {
          type: "vector",
          url: "pmtiles:///maps/exchange/openfreemap-z0-11.pmtiles",
        },
        naturalEarth: {
          type: "raster",
          tiles: ["/maps/exchange/natural-earth/{z}/{x}/{y}.png"],
          tileSize: 256,
        },
      },
      layers: [],
    }
    const context = createMapDeliveryContext(
      "https://api.test",
      "https://objects.test/releases/map-v3/exchange-style.json",
      "https://app.test"
    )

    expect(context).toEqual({
      deliveryPrefix: "https://objects.test/releases/map-v3/",
      scope: {
        base: "https://api.test",
        trustedOrigins: ["https://app.test", "https://objects.test"],
      },
    })
    expect(resolveMapStyleResourceUrls(style, context)).toMatchObject({
      sprite: "https://objects.test/releases/map-v3/exchange/sprites/ofm",
      glyphs:
        "https://objects.test/releases/map-v3/exchange/fonts/{fontstack}/{range}.pbf",
      sources: {
        openmaptiles: {
          url: "pmtiles://https://objects.test/releases/map-v3/exchange/openfreemap-z0-11.pmtiles",
        },
        naturalEarth: {
          tiles: [
            "https://objects.test/releases/map-v3/exchange/natural-earth/{z}/{x}/{y}.png",
          ],
        },
      },
    })
    expect(() =>
      resolveMapStyleResourceUrls(
        { ...style, sprite: "https://foreign.test/sprites/ofm" },
        context
      )
    ).toThrow(/同源/)
  })

  it("keeps an ordinary viewport as one bounded request", () => {
    expect(
      splitViewportBounds({ west: 100, south: 20, east: 130, north: 45 })
    ).toEqual([[100, 20, 130, 45]])
  })

  it("splits an antimeridian viewport into non-empty requests", () => {
    expect(
      splitViewportBounds({ west: 170, south: -20, east: -170, north: 20 })
    ).toEqual([
      [170, -20, 180, 20],
      [-180, -20, -170, 20],
    ])
    expect(
      splitViewportBounds({ west: 170, south: -20, east: -180, north: 20 })
    ).toEqual([[170, -20, 180, 20]])
    expect(
      splitViewportBounds({ west: 180, south: -20, east: -170, north: 20 })
    ).toEqual([[-180, -20, -170, 20]])
  })

  it("uses one world request and rejects invalid vertical bounds", () => {
    expect(
      splitViewportBounds({ west: -200, south: -100, east: 200, north: 100 })
    ).toEqual([[-180, -90, 180, 90]])
    expect(
      splitViewportBounds({ west: 100, south: 30, east: 120, north: 30 })
    ).toEqual([])
  })

  it("deduplicates split responses and ORs their truncated state", () => {
    const second = { ...office, id: "office-2", slug: "second" }
    expect(
      mergeMapOfficeResponses([
        { items: [office], truncated: false },
        { items: [office, second], truncated: true },
      ])
    ).toEqual({ items: [office, second], truncated: true })
  })

  it("groups the same regional coordinate without jittering its position", () => {
    const sameGridOffice: FudabaMapOffice = {
      ...office,
      id: "office-2",
      slug: "same-grid",
      name: "同区域事务所",
      accent: "#2581c7",
      seriesCodes: ["cg"],
    }
    const groups = groupMapOffices([office, sameGridOffice], seriesCatalog)

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      key: "31.2,121.5",
      latitude: 31.2,
      longitude: 121.5,
      offices: [office, sameGridOffice],
      colors: ["#f34f6d", "#2681c8"],
    })
  })

  it("uses the catalog colors for canonical agency codes", () => {
    const groups = groupMapOffices(
      [{ ...office, seriesCodes: ["ml", "sc"] }],
      seriesCatalog
    )
    expect(groups[0]?.colors).toEqual(["#ffc30b", "#8dbbff"])
  })
})
