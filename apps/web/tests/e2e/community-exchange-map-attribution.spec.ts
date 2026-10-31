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

function installMapMocks(
  api: ApiDispatcher,
  configuredStyleUrl = styleUrl,
  seriesReads = 1
) {
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
    times: seriesReads,
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
    handle: () => ({
      status: 200,
      json: {
        provider: "maplibre",
        search: { provider: "nominatim" },
        styleUrl: configuredStyleUrl,
      },
    }),
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
const discoveryRail = (page: Page) => searchCard(page)

function attributionTrigger(page: Page) {
  return page.getByRole("menuitem", { name: "查看地图数据来源" })
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

async function openAndCloseAttribution(page: Page, more: Locator) {
  await expect(more).toBeVisible()
  await more.click()
  await attributionTrigger(page).click()
  const dialog = await expectAttributionDialog(page)

  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(more).toBeFocused()

  await more.click()
  await attributionTrigger(page).click()
  await expectAttributionDialog(page)
  await page
    .locator('[data-slot="dialog-overlay"]')
    .click({ position: { x: 4, y: 4 } })
  await expect(page.getByRole("dialog", { name: "地图数据来源" })).toHaveCount(
    0
  )
  await expect(more).toBeFocused()
}

async function openWorkspace(page: Page) {
  await page.goto("/community/exchange")
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.locator("[data-map-office-count]")).toHaveText("0")
  await page.getByRole("button", { name: "展开地图面板" }).click()
  await page.getByRole("tab", { name: "地点", exact: true }).click()
  await page.getByRole("button", { name: "收起地图面板" }).click()
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
    await card.getByRole("textbox", { name: "搜索地点" }).fill("上海场馆")
    expect(requests).toBe(0)
    const submit = card.getByRole("button", { name: "搜索", exact: true })
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
    const emptyStatus = card.getByRole("status")
    await expect(emptyStatus).toContainText("没有找到地点")
    await expect(emptyStatus).toContainText("请尝试城市加场馆名或完整地址。")
    await expect(result).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
  })
  test("retains the editable draft through drawer collapse, Escape and responsive layouts @mobile", async ({
    api,
    page,
  }) => {
    installMapMocks(api)
    await page.setViewportSize({ width: 390, height: 844 })
    await openWorkspace(page)
    const card = searchCard(page)
    const input = card.getByRole("textbox", { name: "搜索地点" })
    const retained = await input.elementHandle()
    const canvas = page.locator("canvas.maplibregl-canvas")
    const mapBox = await canvas.boundingBox()
    await input.fill("上海长地点名称")
    await input.press("Escape")
    await expect(input).toBeFocused()
    await expect(card).toHaveAttribute("data-drawer-open", "false")
    await card.getByRole("button", { name: "展开地图面板" }).click()
    await expect(input).toHaveValue("上海长地点名称")
    await card.getByRole("button", { name: "收起地图面板" }).click()
    await expect.poll(() => canvas.boundingBox()).toEqual(mapBox)
    expect(
      await page.evaluate(() => document.scrollingElement?.scrollTop)
    ).toBe(0)
    await page.setViewportSize({ width: 1024, height: 768 })
    await expect(input).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(input).toBeVisible()
    expect(
      await input.evaluate(
        (element, original) => element === original,
        retained
      )
    ).toBe(true)
    await expect(input).toHaveValue("上海长地点名称")
  })
  test("keeps rounded search actions reachable in a dark short viewport with reduced motion @mobile", async ({
    api,
    page,
  }, testInfo) => {
    installMapMocks(api)
    await page.setViewportSize({ width: 667, height: 375 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openWorkspace(page)
    await page.evaluate(() => document.documentElement.classList.add("dark"))
    await expect
      .poll(() =>
        page.evaluate(() => {
          const locate = document.querySelector(
            '[data-native-glass-control="locate"]'
          )!
          const refresh = document.querySelector(".exchange-web-refresh")!
          return (
            getComputedStyle(locate).backgroundColor ===
            getComputedStyle(refresh).backgroundColor
          )
        })
      )
      .toBe(true)
    const card = searchCard(page)
    const input = card.getByRole("textbox", { name: "搜索地点" })
    await input.fill("上海")
    const actions = [
      input,
      card.getByRole("button", { name: "收起地图面板" }),
      card.getByRole("button", { name: "搜索", exact: true }),
    ]
    for (const action of actions) {
      const rect = await action.boundingBox()
      expect(rect!.y).toBeGreaterThanOrEqual(0)
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(375)
    }
    const cancel = card.getByRole("button", { name: "收起地图面板" })
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
    await input.focus()
    await input.press("Escape")
    await expect(input).toBeFocused()
    expect(
      await card
        .locator(".exchange-web-drawer")
        .evaluate((element) => getComputedStyle(element).transitionDuration)
    ).toBe("0s")
    await page.screenshot({
      path: testInfo.outputPath("dark-map-controls.png"),
    })
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
      const controls = card.locator(".exchange-web-search-dock button:enabled")
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
      await expect(
        page.getByRole("menuitem", { name: "我的交换账号" })
      ).toBeInViewport()
      await expect(attributionTrigger(page)).toBeInViewport()
      await page.screenshot({
        path: `/tmp/exchange-search-menu-web-${width}x${height}.png`,
      })
      await attributionTrigger(page).click()
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

    await expect(
      searchCard(page).getByRole("textbox", { name: "搜索地点" })
    ).toBeVisible()
    await openAndCloseAttribution(
      page,
      discoveryRail(page).getByRole("button", { name: "更多地图工具" })
    )
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
    await attributionTrigger(page).click()
    const dialog = await expectAttributionDialog(page)
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    const desktop = discoveryRail(page).getByRole("button", {
      name: "更多地图工具",
    })
    await expect(desktop).toBeFocused()

    await desktop.click()
    await attributionTrigger(page).click()
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
      await (width < 1024 ? searchCard(page) : discoveryRail(page))
        .getByRole("button", { name: "更多地图工具" })
        .click()
      await expect(
        page.getByRole("menu", { name: "更多地图工具内容" })
      ).toBeVisible()
      await expect(
        page.getByRole("menuitem", { name: "查看地图数据来源" })
      ).toHaveCount(0)
      await expect(
        page.getByRole("dialog", { name: "地图数据来源" })
      ).toHaveCount(0)
      await page.keyboard.press("Escape")
      await expect(page.getByRole("menu")).toHaveCount(0)
    }
  })

  test("retains the same visible tools trigger across responsive layouts @mobile", async ({
    api,
    page,
  }) => {
    installMapMocks(api)
    await page.setViewportSize({ width: 1280, height: 844 })
    await openWorkspace(page)
    const more = page.getByRole("button", { name: "更多地图工具" })
    for (const width of [390, 1280]) {
      await more.click()
      await expect(page.getByRole("menu")).toBeVisible()
      await page.setViewportSize({ width, height: 844 })
      await expect(page.getByRole("menu")).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(page.getByRole("menu")).toHaveCount(0)
      await expect(more).toBeFocused()
    }
  })

  for (const width of [390, 1440]) {
    test(`floats filters and preserves the map, search draft and count at ${width}px @mobile`, async ({
      api,
      page,
    }, testInfo) => {
      installMapMocks(api, styleUrl, 4)
      await page.setViewportSize({ width, height: 844 })
      await openWorkspace(page)
      const input = page.getByRole("textbox", { name: "搜索地点" })
      const retainedInput = await input.elementHandle()
      const canvas = page.locator("canvas.maplibregl-canvas")
      const retainedCanvas = await canvas.elementHandle()
      const frame = await canvas.boundingBox()
      const count = page.locator("[data-map-office-count]")
      const retainedCount = await count.elementHandle()
      await input.fill("保留的搜索草稿")
      await expect(
        page.getByRole("complementary", { name: "交换发现栏" })
      ).toHaveCount(0)
      const more = page.getByRole("button", { name: "更多地图工具" })
      const dialog = page.getByRole("dialog", { name: "筛选地图" })
      const openFilter = async () => {
        await more.click()
        await page.getByRole("menuitem", { name: /^打开筛选/ }).click()
        await expect(
          dialog.getByRole("heading", { name: "筛选地图" })
        ).toBeFocused()
        await expect(dialog).toHaveCSS("opacity", "1")
      }
      await openFilter()
      await expect(dialog).toHaveClass(/exchange-web-filter-popover/)
      await page.screenshot({
        path: testInfo.outputPath("floating-filter.png"),
      })
      await dialog.getByRole("textbox", { name: "城市" }).fill(" 上海 ")
      await dialog.getByRole("button", { name: "按城市查找" }).click()
      await expect(dialog).toHaveCount(0)
      await expect(more).toBeFocused()
      await expect
        .poll(() => new URL(page.url()).searchParams.get("city"))
        .toBe("上海")
      await openFilter()
      await expect(dialog.getByRole("textbox", { name: "城市" })).toHaveValue(
        "上海"
      )
      await dialog.getByRole("checkbox", { name: "仅看开放事务所" }).click()
      await expect(page).toHaveURL(/open=true/)
      await dialog.getByRole("button", { name: "清除筛选" }).click()
      await expect.poll(() => new URL(page.url()).search).toBe("")
      await expect(dialog.getByRole("textbox", { name: "城市" })).toHaveValue(
        ""
      )
      await input.click()
      await expect(dialog).toHaveCount(0)
      await input.click()
      await expect(input).toBeFocused()
      await expect(input).toHaveValue("保留的搜索草稿")
      await openFilter()
      await page.keyboard.press("Escape")
      await expect(dialog).toHaveCount(0)
      await expect(more).toBeFocused()
      await openFilter()
      await dialog.getByRole("button", { name: "关闭筛选浮窗" }).click()
      await expect(dialog).toHaveCount(0)
      await expect(more).toBeFocused()
      await openFilter()
      await page.getByRole("button", { name: "更多地图工具" }).click()
      await expect(
        page.getByRole("menu", { name: "更多地图工具内容" })
      ).toBeVisible()
      await expect(dialog).toHaveCount(0)
      await page.keyboard.press("Escape")
      await expect(page.getByRole("menu")).toHaveCount(0)
      await expect(more).toBeFocused()
      expect(
        await input.evaluate((node, old) => node === old, retainedInput)
      ).toBe(true)
      expect(
        await canvas.evaluate((node, old) => node === old, retainedCanvas)
      ).toBe(true)
      expect(
        await count.evaluate((node, old) => node === old, retainedCount)
      ).toBe(true)
      expect(await canvas.boundingBox()).toEqual(frame)
    })
  }

  for (const width of [390, 900, 1280]) {
    test(`opens compact map tools and restores their trigger at ${width}px @mobile`, async ({
      api,
      page,
    }, testInfo) => {
      installMapMocks(api)
      await page.setViewportSize({ width, height: 844 })
      await page.goto("/community/exchange?open=true")
      await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible()
      const more = page.getByRole("button", { name: "更多地图工具" })
      await expect(more).toHaveAccessibleDescription("已应用筛选")
      await expect(page.getByRole("menuitem")).toHaveCount(0)
      await page.screenshot({ path: testInfo.outputPath("compact-tools.png") })
      for (const [entry, title, tab] of [
        ["打开筛选，已应用筛选", "筛选地图", null],
        ["打开事务所名录", "公开交换名录", "事务所"],
        ["打开名片名录", "公开交换名录", "名片"],
      ] as const) {
        await more.click()
        const menu = page.getByRole("menu", { name: "更多地图工具内容" })
        await expect(menu).toBeInViewport()
        await page.screenshot({
          path: testInfo.outputPath(`menu-${tab ?? "filter"}.png`),
        })
        await menu.getByRole("menuitem", { name: entry }).click()
        const dialog = page.getByRole("dialog", { name: title })
        await expect(dialog).toBeVisible()
        if (tab)
          await expect(
            dialog.getByRole("tab", { name: tab, exact: true })
          ).toHaveAttribute("aria-selected", "true")
        else {
          await expect(
            dialog.getByRole("checkbox", { name: "仅看开放事务所" })
          ).toBeChecked()
          await expect(dialog).toHaveClass(/exchange-web-filter-popover/)
          await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(
            0
          )
          const box = await dialog.boundingBox()
          expect(box!.x).toBeGreaterThanOrEqual(0)
          expect(box!.y).toBeGreaterThanOrEqual(0)
          expect(box!.x + box!.width).toBeLessThanOrEqual(width)
          expect(box!.y + box!.height).toBeLessThanOrEqual(844)
          await page.screenshot({
            path: testInfo.outputPath("floating-filter.png"),
          })
        }
        await page.keyboard.press("Escape")
        await expect(dialog).toHaveCount(0)
        await expect(more).toBeFocused()
      }
      await more.press("ArrowDown")
      await expect(
        page.getByRole("menuitem", { name: "打开筛选，已应用筛选" })
      ).toBeFocused()
      await page.keyboard.press("Escape")
      await expect(page.getByRole("menu")).toHaveCount(0)
      await expect(more).toBeFocused()
      await more.click()
      await expect(page.getByRole("menu")).toBeVisible()
      await expect(more).toHaveAttribute("aria-expanded", "true")
      await page.mouse.click(4, 300)
      await expect(page.getByRole("menu")).toHaveCount(0)
      await expect(more).toHaveAttribute("aria-expanded", "false")
    })
  }
})
