import { createServer } from "node:http"
import { writeFileSync } from "node:fs"
import {
  fudabaCardPageSchema,
  fudabaCardQuerySchema,
  fudabaMapConfigSchema,
  fudabaMapOfficeListSchema,
  fudabaMapQuerySchema,
  fudabaOfficePageSchema,
  fudabaOfficeQuerySchema,
  fudabaPlaceSearchQuerySchema,
  fudabaPlaceSearchResponseSchema,
  fudabaSeriesListSchema,
} from "@imsweb/contracts/fudaba"
import {
  wikiCatalogQuerySchema,
  wikiPublicCatalogSchema,
} from "@imsweb/contracts/wiki"
import type { z } from "@imsweb/contracts/z"

// The installed task package targets these loopback origins. These servers
// serve contract-validated test data only; they never proxy to a provider/API.
const records: { method: string; path: string; query: string }[] = []
const emptyPage = {
  items: [],
  pageInfo: { hasNextPage: false, nextCursor: null },
}
const routes = new Map<
  string,
  { query?: z.ZodTypeAny; response: z.ZodTypeAny; value: unknown }
>([
  [
    "/api/community/exchange/series",
    { response: fudabaSeriesListSchema, value: { items: [] } },
  ],
  [
    "/api/community/exchange/offices",
    {
      query: fudabaOfficeQuerySchema,
      response: fudabaOfficePageSchema,
      value: emptyPage,
    },
  ],
  [
    "/api/community/exchange/cards",
    {
      query: fudabaCardQuerySchema,
      response: fudabaCardPageSchema,
      value: emptyPage,
    },
  ],
  [
    "/api/community/exchange/map/config",
    {
      response: fudabaMapConfigSchema,
      value: { styleUrl: "/maps/exchange-native-test-style.json" },
    },
  ],
  [
    "/api/community/exchange/map/offices",
    {
      query: fudabaMapQuerySchema,
      response: fudabaMapOfficeListSchema,
      value: { items: [], truncated: false },
    },
  ],
  [
    "/api/wiki/catalog",
    {
      query: wikiCatalogQuerySchema,
      response: wikiPublicCatalogSchema,
      value: {
        status: "success",
        agencies: [],
        searchEntries: [],
        selection: null,
      },
    },
  ],
])
const results = Array.from({ length: 5 }, (_, index) => ({
  id: `native-place:${index + 1}`,
  label: `Native Hall ${index + 1}`,
  address: `Shanghai local fixture address ${index + 1}. `.repeat(10),
  city: "上海市",
  location: {
    latitude: 31.2 + index * 0.001,
    longitude: 121.5,
    precision: "exact",
  },
}))
const searchResponse = fudabaPlaceSearchResponseSchema.parse({
  success: true,
  items: results,
  attribution: "© OpenStreetMap contributors",
})
for (const route of routes.values()) route.response.parse(route.value)
const style = {
  version: 8,
  name: "IMSWeb native search local test map",
  sources: {
    "license-notice": {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      attribution:
        '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#e8f2f4" },
    },
  ],
}
const servers = [65534, 4187].map((port) =>
  createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`)
    response.setHeader("Access-Control-Allow-Origin", "*")
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
    response.setHeader("Access-Control-Allow-Headers", "*")
    if (request.method === "OPTIONS") {
      response.writeHead(204).end()
      return
    }
    if (request.method !== "GET") {
      response.writeHead(405).end()
      return
    }
    records.push({
      method: request.method,
      path: url.pathname,
      query: url.search,
    })
    writeFileSync(
      "/tmp/exchange-native-requests.json",
      JSON.stringify(records, null, 2)
    )
    try {
      let value: unknown
      if (
        port === 4187 &&
        url.pathname === "/maps/exchange-native-test-style.json"
      ) {
        value = style
      } else if (
        port === 65534 &&
        url.pathname === "/api/community/exchange/places/search"
      ) {
        fudabaPlaceSearchQuerySchema.parse(Object.fromEntries(url.searchParams))
        value = searchResponse
      } else {
        const route = port === 65534 ? routes.get(url.pathname) : undefined
        if (!route) {
          console.error(`UNREGISTERED ${request.method} ${url.pathname}`)
          response.writeHead(404).end()
          return
        }
        route.query?.parse(Object.fromEntries(url.searchParams))
        value = route.response.parse(route.value)
      }
      response.setHeader("Content-Type", "application/json")
      response.end(JSON.stringify(value))
    } catch (error) {
      console.error(`FIXTURE CONTRACT ERROR ${url.pathname}`, error)
      response.writeHead(500).end()
    }
  }).listen(port, "127.0.0.1", () =>
    console.log(`fixture listening 127.0.0.1:${port}`)
  )
)
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    for (const server of servers) server.close()
  })
