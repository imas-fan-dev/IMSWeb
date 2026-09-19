import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  fudabaCardPageSchema,
  fudabaCardQuerySchema,
  fudabaMapConfigSchema,
  fudabaMapOfficeListSchema,
  fudabaMapQuerySchema,
  fudabaOfficePageSchema,
  fudabaOfficeQuerySchema,
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

const bottomNavigation = (page: Page) =>
  page.locator('nav[aria-label="交换地图导航"]')
const topCard = (page: Page) => page.locator('section[aria-label="地图工具"]')
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
  test("opens the attribution dialog from the bottom navigation below 768px", async ({
    api,
    page,
  }) => {
    installMapMocks(api)
    await page.setViewportSize({ width: 400, height: 780 })
    await openWorkspace(page)

    await expect(attributionTrigger(topCard(page))).toBeHidden()
    await expect(attributionTrigger(discoveryRail(page))).toBeHidden()
    await openAndCloseAttribution(
      page,
      attributionTrigger(bottomNavigation(page))
    )
  })

  test("opens the attribution dialog from the top card between 768px and 1023px", async ({
    api,
    page,
  }) => {
    installMapMocks(api)
    await page.setViewportSize({ width: 900, height: 800 })
    await openWorkspace(page)

    await expect(attributionTrigger(bottomNavigation(page))).toBeHidden()
    await expect(attributionTrigger(discoveryRail(page))).toBeHidden()
    await openAndCloseAttribution(page, attributionTrigger(topCard(page)))
  })

  test("opens the attribution dialog from the discovery rail at 1024px and up", async ({
    api,
    page,
  }) => {
    installMapMocks(api)
    await page.setViewportSize({ width: 1280, height: 800 })
    await openWorkspace(page)

    await expect(attributionTrigger(bottomNavigation(page))).toBeHidden()
    await expect(attributionTrigger(topCard(page))).toBeHidden()
    await openAndCloseAttribution(page, attributionTrigger(discoveryRail(page)))
  })

  test("keeps every entry inside 375px with six 44px bottom targets", async ({
    api,
    page,
  }) => {
    installMapMocks(api)
    await page.setViewportSize({ width: 375, height: 780 })
    await openWorkspace(page)

    const navigation = bottomNavigation(page)
    await expect(navigation.getByRole("button")).toHaveCount(5)
    await expect(navigation.getByRole("link")).toHaveCount(1)

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      )
    ).toBeLessThanOrEqual(0)

    const entries = [
      ...(await navigation.getByRole("button").all()),
      ...(await navigation.getByRole("link").all()),
    ]
    for (const entry of entries) {
      const box = await entry.boundingBox()
      expect(box).not.toBeNull()
      expect(box?.width).toBeGreaterThanOrEqual(44)
      expect(box?.height).toBeGreaterThanOrEqual(44)
    }

    await openAndCloseAttribution(
      page,
      attributionTrigger(bottomNavigation(page))
    )
  })

  test("renders no entry and no empty dialog when the style carries no notice", async ({
    api,
    page,
  }) => {
    installMapMocks(api, silentStyleUrl)
    await openWorkspace(page)

    // Every visible range of the width spectrum: the bottom navigation below
    // 768px, the top card between 768px and 1023px, the rail from 1024px up.
    for (const width of [400, 900, 1280]) {
      await page.setViewportSize({ width, height: 800 })
      await expect(
        page.getByRole("button", { name: "查看地图数据来源" })
      ).toHaveCount(0)
      await expect(
        page.getByRole("dialog", { name: "地图数据来源" })
      ).toHaveCount(0)
    }
  })
})
