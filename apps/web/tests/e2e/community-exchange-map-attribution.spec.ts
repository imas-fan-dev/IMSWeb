import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  fudabaCardPageSchema,
  fudabaCardQuerySchema,
  fudabaErrorResponseSchema,
  fudabaMapConfigSchema,
  fudabaMapOfficeListSchema,
  fudabaMapQuerySchema,
  fudabaOfficePageSchema,
  fudabaOfficeQuerySchema,
  fudabaPlaceSearchQuerySchema,
  fudabaPlaceSearchResponseSchema,
  fudabaSeriesListSchema,
} from "@imsweb/contracts/fudaba"
import type { Locator, Page } from "@playwright/test"

import { expect, test, type ApiDispatcher } from "./fixtures/test"
import { installSeededPublicApis } from "./fixtures/public-content"

/**
 * The OpenMapTiles notice is a licence obligation authored in the production
 * style asset. Read it from that file so the browser test proves the shipped
 * string reaches the dialog; a copy here could drift from the licence text.
 */
const productionStyle = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "public/maps/exchange-style.json"),
    "utf8"
  )
) as { sources: { openmaptiles: { attribution: string } } }
const attributionNotice = productionStyle.sources.openmaptiles.attribution

// A local, dependency-free style. The inline GeoJSON source never fetches
// anything, so MapLibre's error handler cannot tear the map down while the
// dialog assertions run. Omitting the notice describes the licence-free case
// that must leave every entry point unrendered.
//
// The source is deliberately not named `openmaptiles`: the boundary-compliance
// pass adds its `boundary_china_claim` layer with `source-layer: "boundary"`
// whenever that id exists, and MapLibre rejects a source layer on a GeoJSON
// source — which would replace the map with the unavailable card. A GeoJSON
// source under any other id keeps the licence text while leaving the boundary
// layer alone; the `openmaptiles` id itself is covered by the map component
// test.
function testStyle(attribution?: string) {
  return {
    version: 8,
    name: "IMSWeb attribution test map",
    sources: {
      "license-notice": {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        ...(attribution ? { attribution } : {}),
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
}

const attributionStyle = testStyle(attributionNotice)
const silentStyle = testStyle()

const styleUrl = "/maps/exchange-attribution-test-style.json"
const silentStyleUrl = "/maps/exchange-silent-test-style.json"

const emptyPage = {
  items: [],
  pageInfo: { hasNextPage: false, nextCursor: null },
}

function installMapMocks(api: ApiDispatcher, configuredStyleUrl = styleUrl) {
  // The mounted workspace also renders series icons, which read the wiki
  // catalog for their fallback artwork. It is unrelated to this workflow, so it
  // gets a deterministic empty catalog instead of a live-call pass-through.
  installSeededPublicApis(api, [
    { path: "/api/wiki/catalog", times: { min: 0, max: 2 } },
  ])
  api.expect({
    name: "attribution exchange series",
    method: "GET",
    path: "/api/community/exchange/series",
    responses: { 200: fudabaSeriesListSchema },
    times: 1,
    handle: () => ({ status: 200, json: { items: [] } }),
  })
  api.expect({
    name: "attribution exchange offices",
    method: "GET",
    path: "/api/community/exchange/offices",
    query: fudabaOfficeQuerySchema,
    responses: { 200: fudabaOfficePageSchema },
    times: { min: 1, max: 4 },
    handle: () => ({ status: 200, json: emptyPage }),
  })
  api.expect({
    name: "attribution exchange cards",
    method: "GET",
    path: "/api/community/exchange/cards",
    query: fudabaCardQuerySchema,
    responses: { 200: fudabaCardPageSchema },
    times: { min: 1, max: 4 },
    handle: () => ({ status: 200, json: emptyPage }),
  })
  api.expect({
    name: "attribution map config",
    method: "GET",
    path: "/api/community/exchange/map/config",
    responses: { 200: fudabaMapConfigSchema },
    times: 1,
    handle: () => ({ status: 200, json: { styleUrl: configuredStyleUrl } }),
  })
  api.expect({
    name: "attribution map offices",
    method: "GET",
    path: "/api/community/exchange/map/offices",
    query: fudabaMapQuerySchema,
    responses: { 200: fudabaMapOfficeListSchema },
    times: { min: 1, max: 8 },
    handle: () => ({ status: 200, json: { items: [], truncated: false } }),
  })
}

const searchCard = (page: Page) =>
  page.getByRole("region", { name: "地点查找" })
const discoveryRail = (page: Page) =>
  page.locator('aside[aria-label="交换发现栏"]')

function attributionTrigger(scope: Locator) {
  return scope.getByRole("button", { name: "查看地图数据来源" })
}

async function expectAttributionDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: "地图数据来源" })
  await expect(dialog).toBeVisible()

  const links = dialog.getByRole("link")
  await expect(links).toHaveText([
    "OpenFreeMap",
    "© OpenMapTiles",
    "OpenStreetMap",
  ])
  await expect(links.nth(0)).toHaveAttribute("href", "https://openfreemap.org/")
  await expect(links.nth(1)).toHaveAttribute(
    "href",
    "https://www.openmaptiles.org/"
  )
  await expect(links.nth(2)).toHaveAttribute(
    "href",
    "https://www.openstreetmap.org/copyright"
  )
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute("target", "_blank")
    await expect(link).toHaveAttribute("rel", /noopener/)
  }
  await expect(dialog).toContainText("Data from")

  return dialog
}

async function openAndCloseAttribution(page: Page, trigger: Locator) {
  await expect(trigger).toBeVisible()
  await trigger.click()
  const dialog = await expectAttributionDialog(page)

  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()

  await trigger.click()
  await expectAttributionDialog(page)
  await page
    .locator('[data-slot="dialog-overlay"]')
    .click({ position: { x: 4, y: 4 } })
  await expect(page.getByRole("dialog", { name: "地图数据来源" })).toHaveCount(
    0
  )
  await expect(trigger).toBeFocused()
}

async function openWorkspace(page: Page) {
  await page.goto("/community/exchange")
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({
    timeout: 15_000,
  })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
  await page.route(
    (url) =>
      ["http:", "https:"].includes(url.protocol) &&
      !["127.0.0.1", "localhost"].includes(url.hostname),
    (route) => route.abort("blockedbyclient")
  )
  // Non-API map asset: the dispatcher owns `/api`, this belongs to the browser
  // boundary, so a direct route is the intended tool here.
  await page.route(`**${styleUrl}`, (route) =>
    route.fulfill({ json: attributionStyle })
  )
  await page.route(`**${silentStyleUrl}`, (route) =>
    route.fulfill({ json: silentStyle })
  )
})

test.describe("community exchange map attribution", () => {
  test("keeps long results usable and retains them through 429 and 503 retries @mobile", async ({
    api,
    page,
  }) => {
    installMapMocks(api)
    await page.setViewportSize({ width: 320, height: 568 })
    const place = {
      id: "place:long",
      label: "上海市西岸艺术中心国际交流与展览活动场馆".repeat(2),
      address: "上海市徐汇区龙腾大道国际艺术中心南侧入口".repeat(2),
      city: "上海市",
      location: { latitude: 31.2, longitude: 121.5, precision: "exact" },
    }
    let requests = 0
    api.expect({
      name: "Long place and retry responses",
      method: "GET",
      path: "/api/community/exchange/places/search",
      query: fudabaPlaceSearchQuerySchema,
      responses: {
        200: fudabaPlaceSearchResponseSchema,
        429: fudabaErrorResponseSchema,
        503: fudabaErrorResponseSchema,
      },
      times: 4,
      handle: () => {
        requests += 1
        return requests === 2
          ? { status: 429, json: { error: "rate limited" } }
          : requests === 3
            ? { status: 503, json: { error: "not configured" } }
            : {
                status: 200,
                json: {
                  success: true,
                  items: requests === 1 ? [place] : [],
                  attribution: "© OpenStreetMap contributors",
                },
              }
      },
    })
    await openWorkspace(page)
    const card = searchCard(page)
    await card.getByRole("button", { name: "查找地点" }).click()
    await card.getByRole("button", { name: "展开结果" }).click()
    await card.getByRole("textbox", { name: "搜索地点" }).fill("上海场馆")
    expect(requests).toBe(0)
    const submit = card.getByRole("button", { name: "查找", exact: true })
    await submit.click()
    const result = card.getByRole("button", {
      name: `${place.label} ${place.address}`,
    })
    await expect(result).toBeVisible()
    const box = await result.boundingBox()
    expect(box!.y + box!.height).toBeLessThanOrEqual(568)
    expect(
      await result.evaluate(
        (element) => element.scrollWidth <= element.clientWidth
      )
    ).toBe(true)
    await submit.click()
    await expect(card.getByRole("alert")).toContainText("地点搜索正忙")
    await expect(result).toBeVisible()
    await submit.click()
    await expect(card.getByRole("alert")).toContainText("地点搜索服务尚未配置")
    await expect(result).toBeVisible()
    await submit.click()
    await expect(
      card.getByText("没有找到地点，请尝试城市加场馆名或完整地址。")
    ).toBeVisible()
    await expect(result).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
  })
  test("drags search detents, retains a draft and returns focus through Escape @mobile", async ({
    api,
    page,
  }) => {
    installMapMocks(api)
    await page.setViewportSize({ width: 390, height: 844 })
    await openWorkspace(page)
    const card = searchCard(page)
    const handle = card.getByRole("button", { name: "展开地点查找" })
    const box = await handle.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width / 2, box!.y - 180, { steps: 8 })
    await page.mouse.up()
    await expect(card).toHaveAttribute("data-detent", "medium")
    const input = card.getByRole("textbox", { name: "搜索地点" })
    await input.fill("上海长地点名称")
    await input.press("Escape")
    await expect(card.getByRole("button", { name: "取消" })).toBeFocused()
    await page.keyboard.press("Escape")
    const trigger = card.getByRole("button", { name: "查找地点" })
    await expect(trigger).toBeFocused()
    await trigger.click()
    await expect(input).toHaveValue("上海长地点名称")
    await card.getByRole("button", { name: "取消" }).click()
    expect(
      await page.evaluate(() => document.scrollingElement?.scrollTop)
    ).toBe(0)
    await page.setViewportSize({ width: 1024, height: 768 })
    await expect(card).toBeHidden()
    await expect(page.locator("[data-exchange-desktop-search]")).toBeFocused()
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(trigger).toBeVisible()
    await expect(card).toHaveAttribute("data-detent", "collapsed")
  })
  test("keeps rounded search actions reachable in a dark short viewport with reduced motion @mobile", async ({
    api,
    page,
  }) => {
    installMapMocks(api)
    await page.setViewportSize({ width: 667, height: 375 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openWorkspace(page)
    await page.evaluate(() => document.documentElement.classList.add("dark"))
    const card = searchCard(page)
    const trigger = card.getByRole("button", { name: "查找地点" })
    expect(
      await card.evaluate(
        (element) => getComputedStyle(element).borderTopLeftRadius
      )
    ).toBe("28px")
    expect(
      await trigger.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        radius: getComputedStyle(element).borderTopLeftRadius,
      }))
    ).toEqual({ height: 48, radius: "24px" })
    await trigger.click()
    const actions = [
      card.getByRole("textbox", { name: "搜索地点" }),
      card.getByRole("button", { name: "取消" }),
      card.getByRole("button", { name: "查找", exact: true }),
    ]
    for (const action of actions) {
      const rect = await action.boundingBox()
      expect(rect!.y).toBeGreaterThanOrEqual(0)
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(375)
    }
    await card.getByRole("textbox", { name: "搜索地点" }).fill("上海")
    const cancel = card.getByRole("button", { name: "取消" })
    expect(
      await cancel.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return element.contains(
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2
          )
        )
      })
    ).toBe(true)
    await cancel.click()
    await expect(trigger).toBeFocused()
  })
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [900, 1200],
    [1023, 768],
    [844, 390],
    [667, 375],
  ]) {
    test(`keeps bottom search and source reachable at ${width}x${height} @mobile`, async ({
      api,
      page,
    }) => {
      installMapMocks(api)
      await page.setViewportSize({ width: width!, height: height! })
      await openWorkspace(page)
      const card = searchCard(page)
      await expect(card).toBeVisible()
      await expect(page.locator('section[aria-label="地图工具"]')).toHaveCount(
        0
      )
      await expect(attributionTrigger(discoveryRail(page))).toBeHidden()
      const controls = card.getByRole("button")
      const geometry = await controls.evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect()
          return {
            width: box.width,
            height: box.height,
            visible:
              box.top >= 0 &&
              box.bottom <= innerHeight &&
              box.left >= 0 &&
              box.right <= innerWidth,
            hit: element.contains(
              document.elementFromPoint(
                box.x + box.width / 2,
                box.y + box.height / 2
              )
            ),
          }
        })
      )
      expect(
        geometry.every(
          (item) =>
            item.width >= 44 && item.height >= 44 && item.visible && item.hit
        )
      ).toBe(true)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth
        )
      ).toBeLessThanOrEqual(0)
      const more = card.getByRole("button", { name: "更多地图工具" })
      await more.click()
      await attributionTrigger(card).click()
      const dialog = await expectAttributionDialog(page)
      await page.keyboard.press("Escape")
      await expect(dialog).toHaveCount(0)
      await expect(more).toBeFocused()
      await page.screenshot({
        path: `/tmp/exchange-search-web-${width}x${height}.png`,
      })
    })
  }

  test("opens the attribution dialog from the discovery rail at 1024px and up", async ({
    api,
    page,
  }) => {
    installMapMocks(api)
    await page.setViewportSize({ width: 1280, height: 800 })
    await openWorkspace(page)

    await expect(searchCard(page)).toBeHidden()
    await openAndCloseAttribution(page, attributionTrigger(discoveryRail(page)))
  })

  test("returns source focus to the visible entry after a desktop breakpoint crossing @mobile", async ({
    api,
    page,
  }) => {
    installMapMocks(api)
    await page.setViewportSize({ width: 1023, height: 768 })
    await openWorkspace(page)
    const more = searchCard(page).getByRole("button", {
      name: "更多地图工具",
    })
    await more.click()
    await attributionTrigger(searchCard(page)).click()
    const dialog = await expectAttributionDialog(page)
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    const desktop = attributionTrigger(discoveryRail(page))
    await expect(desktop).toBeFocused()

    await desktop.click()
    await expectAttributionDialog(page)
    await page.setViewportSize({ width: 1023, height: 768 })
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(more).toBeFocused()
  })

  test("renders no entry and no empty dialog when the style carries no notice", async ({
    api,
    page,
  }) => {
    installMapMocks(api, silentStyleUrl)
    await openWorkspace(page)

    // The bottom search card covers both narrow ranges; desktop uses the rail.
    for (const width of [400, 900, 1280]) {
      await page.setViewportSize({ width, height: 800 })
      if (width < 1024)
        await searchCard(page)
          .getByRole("button", { name: "更多地图工具" })
          .click()
      await expect(
        page.getByRole("button", { name: "查看地图数据来源" })
      ).toHaveCount(0)
      await expect(
        page.getByRole("dialog", { name: "地图数据来源" })
      ).toHaveCount(0)
    }
  })
})
