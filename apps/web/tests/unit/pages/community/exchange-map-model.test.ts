import { describe, expect, it } from "vitest"

import type { FudabaMapOffice } from "~/lib/api"
import {
  groupMapOffices,
  mergeMapOfficeResponses,
  resolveSameOriginMapResourceUrl,
  splitViewportBounds,
} from "~/pages/community/exchange/exchange-map-model"

const office: FudabaMapOffice = {
  id: "office-1",
  slug: "shanghai-weekend",
  name: "上海周末交换事务所",
  city: "上海",
  accent: "#f34e6c",
  isOpen: true,
  seriesCodes: ["765as"],
  location: {
    latitude: 31.2,
    longitude: 121.5,
    precision: "regional",
  },
}

describe("exchange map model", () => {
  it("allows only same-origin HTTP(S) map resources", () => {
    expect(
      resolveSameOriginMapResourceUrl(
        "/api/community/exchange/map/style.json",
        "https://ims.test"
      )
    ).toBe("https://ims.test/api/community/exchange/map/style.json")
    expect(
      resolveSameOriginMapResourceUrl(
        "https://ims.test/assets/map/tile.pbf",
        "https://ims.test"
      )
    ).toBe("https://ims.test/assets/map/tile.pbf")

    for (const resource of [
      "https://tiles.example.test/map.pbf",
      "data:application/json,%7B%7D",
      "mapbox://styles/example/style",
      "file:///tmp/map.json",
    ]) {
      expect(() =>
        resolveSameOriginMapResourceUrl(resource, "https://ims.test")
      ).toThrow(/HTTP\(S\)/)
    }
  })

  it("keeps an ordinary viewport as one bounded request", () => {
    expect(
      splitViewportBounds({ west: 100, south: 20, east: 130, north: 45 })
    ).toEqual([[100, 20, 130, 45]])
  })

  it("splits an antimeridian viewport into two non-wrapping requests", () => {
    expect(
      splitViewportBounds({ west: 170, south: -20, east: 190, north: 20 })
    ).toEqual([
      [170, -20, 180, 20],
      [-180, -20, -170, 20],
    ])
    expect(
      splitViewportBounds({ west: 170, south: -20, east: -170, north: 20 })
    ).toEqual([
      [170, -20, 180, 20],
      [-180, -20, -170, 20],
    ])
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
      seriesCodes: ["cinderella"],
    }
    const groups = groupMapOffices([office, sameGridOffice])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      key: "31.2,121.5",
      latitude: 31.2,
      longitude: 121.5,
      offices: [office, sameGridOffice],
      colors: ["var(--franchise-765)", "var(--franchise-cg)"],
    })
  })

  it("maps the exact Million Live and Shiny Colors series codes", () => {
    const groups = groupMapOffices([
      { ...office, seriesCodes: ["million-live", "shiny-colors"] },
    ])
    expect(groups[0]?.colors).toEqual([
      "var(--franchise-ml)",
      "var(--franchise-sc)",
    ])
  })
})
