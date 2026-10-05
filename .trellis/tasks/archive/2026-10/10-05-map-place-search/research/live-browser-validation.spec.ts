// Copy into apps/web/tests/e2e/map-live-validation.spec.ts for the owned local
// validation run, then remove it. This lane requires browser-validation-server.ts.
import {
  fudabaCardPageSchema,
  fudabaCardQuerySchema,
  fudabaMapOfficeListSchema,
  fudabaMapQuerySchema,
  fudabaOfficePageSchema,
  fudabaOfficeQuerySchema,
  fudabaPlaceSearchQuerySchema,
  fudabaPlaceSearchResponseSchema,
  fudabaSeriesListSchema,
} from "@imsweb/contracts/fudaba"
import { installBrowserIconMock } from "./fixtures/homepage"
import { expect, test } from "./fixtures/test"

test.describe("live map place validation", () => {
  test("searches a real venue through the Web proxy and moves the basemap", {
    tag: ["@mobile", "@app-iphone", "@app-landscape"],
  }, async ({ page, api }, testInfo) => {
    await page.addInitScript(() => localStorage.setItem("imsweb.language", "zh-CN"))
    await installBrowserIconMock(api)
    for (const [path, query, response] of [
      ["/api/community/exchange/offices", fudabaOfficeQuerySchema, fudabaOfficePageSchema],
      ["/api/community/exchange/cards", fudabaCardQuerySchema, fudabaCardPageSchema],
    ] as const) {
      api.expect({ name: `Empty validation directory ${path}`, method: "GET", path, query,
        responses: { 200: response }, times: { min: 1, max: 4 },
        handle: () => ({ status: 200, json: { items: [], pageInfo: { hasNextPage: false, nextCursor: null } } }),
      })
    }
    api.expect({ name: "Empty validation series", method: "GET", path: "/api/community/exchange/series",
      responses: { 200: fudabaSeriesListSchema }, times: { min: 1, max: 4 },
      handle: () => ({ status: 200, json: { items: [] } }),
    })
    api.passThrough({ name: "Real application map config", reason: "Owned HTTP Hono server on 3206 with explicit validation style", method: "GET", path: "/api/community/exchange/map/config", times: 1 })
    api.passThrough({ name: "Real Nominatim application search", reason: "Owned HTTP Hono server on 3206 uses explicit provider and shared Valkey", method: "GET", path: "/api/community/exchange/places/search", query: fudabaPlaceSearchQuerySchema, times: 2 })
    const bounds: string[] = []
    api.expect({ name: "Validation regional map offices", method: "GET", path: "/api/community/exchange/map/offices", query: fudabaMapQuerySchema,
      responses: { 200: fudabaMapOfficeListSchema }, times: { min: 2, max: 12 },
      handle: ({ query }) => { bounds.push(String(query.bbox)); return { status: 200, json: { items: [], truncated: false } } },
    })
    const errors: string[] = []
    const mutations: string[] = []
    let tileLoaded = false
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("request", (request) => { if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) mutations.push(request.url()) })
    page.on("response", (response) => { if (response.url().includes("tiles.openfreemap.org") && /\.pbf(?:$|\?)/.test(response.url()) && response.ok()) tileLoaded = true })
    await page.goto("/community/exchange/")
    await expect(page.locator("[data-exchange-office-map]")).toHaveAttribute("data-map-state", "ready", { timeout: 15_000 })
    const trigger = page.getByRole("button", { name: "查找地点", exact: true })
    await trigger.click()
    const input = page.getByRole("textbox", { name: "搜索地点" })
    await input.fill("西岸艺术中心")
    const responsePromise = page.waitForResponse((response) => response.url().includes("/places/search?") && response.request().method() === "GET")
    await input.press("Enter")
    const response = await responsePromise
    expect(response.status()).toBe(200)
    const raw = await response.json()
    const parsed = fudabaPlaceSearchResponseSchema.parse(raw)
    expect(parsed).toEqual(raw)
    const place = parsed.items.find((item) => item.label === "西岸艺术中心")!
    expect(place).toBeDefined()
    expect(place.city).toBe("上海市")
    await expect(page.getByText(parsed.attribution, { exact: true })).toBeVisible()
    const result = page.getByRole("button", { name: /西岸艺术中心.*龙腾大道/ })
    await expect.poll(() => result.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return [
        [rect.left + 3, rect.top + 3],
        [rect.right - 3, rect.bottom - 3],
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
      ].every(([x, y]) => element.contains(document.elementFromPoint(x, y)))
    })).toBe(true)
    await page.screenshot({ path: testInfo.outputPath("live-search-results.png") })
    await result.click()
    await expect(trigger).toBeFocused()
    const marker = page.getByRole("img", { name: "搜索地点：西岸艺术中心" })
    await expect(marker).toBeVisible()
    await expect.poll(() => bounds.some((value) => {
      const [west, south, east, north] = value.split(",").map(Number)
      return west < place.location.longitude && east > place.location.longitude && south < place.location.latitude && north > place.location.latitude && east - west < 1
    })).toBe(true)
    await expect.poll(() => tileLoaded).toBe(true)
    await expect.poll(async () => {
      const image = await page.locator("canvas.maplibregl-canvas").screenshot()
      return page.evaluate(async (base64) => {
        const image = new Image()
        image.src = `data:image/png;base64,${base64}`
        await image.decode()
        const probe = document.createElement("canvas")
        probe.width = image.naturalWidth
        probe.height = image.naturalHeight
        const context = probe.getContext("2d", { willReadFrequently: true })!
        context.drawImage(image, 0, 0)
        const pixels = context.getImageData(0, 0, probe.width, probe.height).data
        const colors = new Map<string, number>()
        let samples = 0
        for (let index = 0; index < pixels.length; index += 64) {
          const color = `${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`
          colors.set(color, (colors.get(color) ?? 0) + 1)
          samples++
        }
        return Math.max(...colors.values()) / samples < 0.9
      }, image.toString("base64"))
    }).toBe(true)
    await expect(page.getByRole("status").filter({ hasText: "已定位：西岸艺术中心" })).toContainText("© OpenStreetMap contributors")
    await page.screenshot({ path: testInfo.outputPath("live-selected-venue-basemap.png") })
    await page.getByRole("button", { name: "清除搜索地点" }).click()
    await expect(marker).toHaveCount(0)
    await trigger.click()
    await input.fill("西岸艺术中心")
    const repeatedResponse = page.waitForResponse((response) => response.url().includes("/places/search?"))
    await page.getByRole("button", { name: "搜索", exact: true }).click()
    expect((await repeatedResponse).status()).toBe(200)
    await expect(page.getByRole("button", { name: /西岸艺术中心.*龙腾大道/ })).toBeVisible()
    expect(mutations).toEqual([])
    expect(errors).toEqual([])
    const geometry = await page.locator("#exchange-map-place-search").boundingBox()
    expect(geometry).not.toBeNull()
    expect(geometry!.x).toBeGreaterThanOrEqual(0)
    expect(geometry!.x + geometry!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    console.log(JSON.stringify({ project: testInfo.project.name, apiResponseUrl: response.url(), place, attribution: parsed.attribution, bounds, tileLoaded, mutations, errors }))
  })
})
