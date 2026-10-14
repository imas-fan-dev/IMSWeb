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

import { installHomepageLinksMock } from "./fixtures/homepage"
import { installSeededPublicApis } from "./fixtures/public-content"
import { expect, test, type ApiDispatcher } from "./fixtures/test"

const emptyPage = {
  items: [],
  pageInfo: { hasNextPage: false, nextCursor: null },
}

const series = {
  items: [
    {
      id: 1,
      code: "765",
      displayName: "765PRO",
      color: "#f34f6d",
      iconUrl: null,
      imageTransform: {
        fit: "contain",
        focalX: 0.5,
        focalY: 0.5,
        zoom: 1,
        rotation: 0,
      },
      displayOrder: 0,
      activeOfficeCount: 0,
    },
  ],
}

function installMapMocks(api: ApiDispatcher) {
  const mapBounds: string[] = []

  installSeededPublicApis(api, [
    { path: "/api/wiki/random_idol", times: { min: 0, max: 2 } },
    { path: "/api/wiki/catalog", times: { min: 0, max: 2 } },
    { path: "/api/news", times: { min: 0, max: 2 } },
    { path: "/api/events", times: { min: 0, max: 2 } },
    {
      path: "/api/community-posts/spotlight",
      times: { min: 0, max: 2 },
    },
  ])
  api.expect({
    name: "App map series",
    method: "GET",
    path: "/api/community/exchange/series",
    responses: { 200: fudabaSeriesListSchema },
    times: { min: 1, max: 4 },
    handle: () => ({ status: 200, json: series }),
  })
  api.expect({
    name: "App map office directory",
    method: "GET",
    path: "/api/community/exchange/offices",
    query: fudabaOfficeQuerySchema,
    responses: { 200: fudabaOfficePageSchema },
    times: { min: 1, max: 4 },
    handle: () => ({ status: 200, json: emptyPage }),
  })
  api.expect({
    name: "App map card directory",
    method: "GET",
    path: "/api/community/exchange/cards",
    query: fudabaCardQuerySchema,
    responses: { 200: fudabaCardPageSchema },
    times: { min: 1, max: 4 },
    handle: () => ({ status: 200, json: emptyPage }),
  })
  api.expect({
    name: "App map config",
    method: "GET",
    path: "/api/community/exchange/map/config",
    responses: { 200: fudabaMapConfigSchema },
    times: { min: 1, max: 2 },
    handle: () => ({
      status: 200,
      json: { styleUrl: "/maps/exchange-test-style.json" },
    }),
  })
  api.expect({
    name: "App map viewport offices",
    method: "GET",
    path: "/api/community/exchange/map/offices",
    query: fudabaMapQuerySchema,
    responses: { 200: fudabaMapOfficeListSchema },
    times: { min: 1, max: 12 },
    handle: ({ query }) => {
      if (query.bbox) {
        mapBounds.push(
          Array.isArray(query.bbox) ? query.bbox.join("|") : query.bbox
        )
      }
      return { status: 200, json: { items: [], truncated: false } }
    },
  })

  return mapBounds
}

async function applySafeArea(page: import("@playwright/test").Page) {
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({
    timeout: 15_000,
  })
  await page.addStyleTag({
    content: `
      :root {
        --safe-area-top: 47px;
        --safe-area-right: 0px;
        --safe-area-bottom: 34px;
        --safe-area-left: 0px;
      }
      @media (orientation: landscape) {
        :root {
          --safe-area-top: 0px;
          --safe-area-right: 47px;
          --safe-area-bottom: 21px;
          --safe-area-left: 47px;
        }
      }
    `,
  })
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    !testInfo.title.includes("keeps DOM search") &&
      !testInfo.title.includes("exposes directory refresh") &&
      !["app-iphone", "app-landscape"].includes(testInfo.project.name),
    "Map canvas geometry is covered on one portrait and one landscape device."
  )
  test.setTimeout(45_000)
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
})

test.describe("app map", () => {
  for (const nativeSearch of [true, false]) {
    test(
      `mixed navigation geometry with ${nativeSearch ? "native search and DOM nav" : "DOM search and native nav"}`,
      { tag: "@app-iphone" },
      async ({ page, api }) => {
        await page.setViewportSize({ width: 440, height: 956 })
        installMapMocks(api)
        await page.addInitScript((searchSupported) => {
          Reflect.set(window, "isTauri", true)
          Object.defineProperty(navigator, "platform", {
            configurable: true,
            get: () => "iPhone",
          })
          const snapshots: Record<string, unknown>[] = []
          Reflect.set(window, "__r4SearchSnapshots", snapshots)
          let callback = 0
          Reflect.set(window, "__TAURI_INTERNALS__", {
            transformCallback: () => ++callback,
            unregisterCallback: () => undefined,
            invoke: async (
              command: string,
              payload: { args?: Record<string, unknown> } = {}
            ) => {
              if (command === "plugin:native-glass|set_search") {
                if (payload.args) snapshots.push(structuredClone(payload.args))
                return { supported: searchSupported, platform: "ios" }
              }
              if (
                command === "plugin:native-glass|configure" ||
                command === "plugin:native-glass|update"
              )
                return { supported: !searchSupported, platform: "ios" }
              if (command === "plugin:event|listen") return callback
              return { supported: false, platform: "ios" }
            },
          })
          Reflect.set(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
            unregisterListener: () => undefined,
          })
        }, nativeSearch)
        await page.goto("/community/exchange")
        const card = page.getByRole("region", {
          name: "地点查找",
          includeHidden: true,
        })
        const nav = page
          .getByRole("navigation", { name: "主导航" })
          .locator("[data-glass-fallback]")
        if (nativeSearch) {
          await expect(nav).toBeVisible()
          await expect(card).toHaveAttribute("data-native-search", "true")
          await expect
            .poll(async () => {
              const actual = await nav.boundingBox()
              const sent = await page.evaluate(
                () =>
                  (
                    Reflect.get(window, "__r4SearchSnapshots") as {
                      navigationFrame?: { x: number; width: number }
                    }[]
                  ).at(-1)?.navigationFrame
              )
              return Boolean(
                actual &&
                sent &&
                Math.abs(actual.x - sent.x) <= 2 &&
                Math.abs(actual.width - sent.width) <= 2
              )
            })
            .toBe(true)
          await page.setViewportSize({ width: 375, height: 667 })
          await expect
            .poll(async () => {
              const actual = await nav.boundingBox()
              const sent = await page.evaluate(
                () =>
                  (
                    Reflect.get(window, "__r4SearchSnapshots") as {
                      navigationFrame?: { x: number; width: number }
                    }[]
                  ).at(-1)?.navigationFrame
              )
              return Boolean(
                actual &&
                sent &&
                Math.abs(actual.x - sent.x) <= 2 &&
                Math.abs(actual.width - sent.width) <= 2
              )
            })
            .toBe(true)
        } else {
          await expect(nav).toHaveCount(0)
          await expect(card).toBeVisible()
          const emit = (
            revision: number,
            x: number,
            width: number,
            viewport = { width: 440, height: 956 }
          ) =>
            page.evaluate(
              (detail) =>
                window.dispatchEvent(
                  new CustomEvent("ims:exchange-navigation-layout", { detail })
                ),
              {
                layoutGeneration: 10,
                revision,
                route: "/community/exchange",
                available: true,
                visible: true,
                inline: { x, width },
                viewport,
                provenance: "native-public-layout-calibrated",
              }
            )
          const edges = () =>
            card.evaluate((element) => {
              const box = element
                .querySelector(".exchange-search-surface")!
                .getBoundingClientRect()
              return { x: box.x, width: box.width }
            })
          // Simulated bridge evidence, not a rendered UIKit tab-bar proof.
          await emit(2, 28, 384)
          await expect.poll(edges).toEqual({ x: 28, width: 384 })
          await emit(1, 40, 360)
          await expect.poll(edges).toEqual({ x: 28, width: 384 })
          await card.getByRole("button", { name: "查找地点" }).click()
          const input = card.getByRole("textbox", { name: "搜索地点" })
          await input.fill("上海场馆")
          await card.getByRole("button", { name: "取消" }).click()
          await expect.poll(edges).toEqual({ x: 28, width: 384 })
          await page.setViewportSize({ width: 375, height: 667 })
          await emit(3, 28, 384)
          await expect.poll(edges).toEqual({ x: 20, width: 335 })
          await emit(4, 24, 327, { width: 375, height: 667 })
          await expect.poll(edges).toEqual({ x: 24, width: 327 })
          await card.getByRole("button", { name: "查找地点" }).click()
          await expect(input).toHaveValue("上海场馆")
          await expect(input).toBeFocused()
        }
      }
    )
  }

  for (const width of [320, 375, 390, 402, 414, 440]) {
    test(
      `navigation alignment at ${width}px keeps full selected text and targets`,
      { tag: "@app-iphone" },
      async ({ page, api }, testInfo) => {
        await page.setViewportSize({ width, height: 880 })
        installMapMocks(api)
        const label = "上海交换场馆长名称完整阅读".repeat(2)
        const address = "上海市徐汇区完整地点地址".repeat(2)
        api.expect({
          name: "Navigation alignment explicit place search",
          method: "GET",
          path: "/api/community/exchange/places/search",
          query: fudabaPlaceSearchQuerySchema,
          responses: { 200: fudabaPlaceSearchResponseSchema },
          times: { min: 1, max: 1 },
          handle: () => ({
            status: 200,
            json: {
              success: true,
              items: [
                {
                  id: "alignment-place",
                  label,
                  address,
                  city: "上海市",
                  location: {
                    latitude: 31.2,
                    longitude: 121.5,
                    precision: "exact",
                  },
                },
              ],
              attribution: "© OpenStreetMap contributors",
            },
          }),
        })
        await page.goto("/community/exchange")
        await applySafeArea(page)
        const card = page.getByRole("region", { name: "地点查找" })
        const nav = page
          .getByRole("navigation", { name: "主导航" })
          .locator("[data-glass-fallback]")
        const aligned = async () => {
          await expect(nav).toBeVisible()
          await expect
            .poll(async () => {
              const navigation = await nav.boundingBox()
              const surfaces = await card.evaluate((element) =>
                [".exchange-search-surface", ".exchange-search-tools"].map(
                  (selector) => {
                    const box = element
                      .querySelector(selector)!
                      .getBoundingClientRect()
                    return { left: box.left, right: box.right }
                  }
                )
              )
              return (
                Boolean(navigation) &&
                surfaces.every(
                  (box) =>
                    Math.abs(box.left - navigation!.x) <= 2 &&
                    Math.abs(box.right - navigation!.x - navigation!.width) <= 2
                )
              )
            })
            .toBe(true)
          await expect
            .poll(() =>
              card.evaluate((element) =>
                [...element.querySelectorAll("button")]
                  .filter((button) => button.getBoundingClientRect().width > 0)
                  .flatMap((button) => {
                    const box = button.getBoundingClientRect()
                    const hit = document.elementFromPoint(
                      box.x + box.width / 2,
                      box.y + box.height / 2
                    )
                    const valid =
                      box.width >= 44 &&
                      box.height >= 44 &&
                      box.top >= 0 &&
                      box.bottom <= innerHeight &&
                      button.contains(hit)
                    return valid
                      ? []
                      : [
                          {
                            name:
                              button.getAttribute("aria-label") ??
                              button.textContent,
                            box: box.toJSON(),
                            hit: hit?.tagName,
                          },
                        ]
                  })
              )
            )
            .toEqual([])
        }
        await aligned()
        await page.screenshot({
          path: testInfo.outputPath(`r4-${width}-browse.png`),
        })
        await card.getByRole("button", { name: "查找地点" }).click()
        await expect(nav).toBeHidden()
        const input = card.getByRole("textbox", { name: "搜索地点" })
        await input.fill("上海场馆")
        await card.getByRole("button", { name: "查找", exact: true }).click()
        await card
          .getByRole("button", { name: `${label} ${address}`, exact: true })
          .click()
        await aligned()
        await expect(card.getByText(label, { exact: true })).toBeVisible()
        await expect(card.getByText(address, { exact: true })).toBeVisible()
        await page.screenshot({
          path: testInfo.outputPath(`r4-${width}-selected.png`),
        })
        await page.addStyleTag({ content: ":root { font-size: 20px; }" })
        await aligned()
        await page.screenshot({
          path: testInfo.outputPath(`r4-${width}-larger-selected.png`),
        })
        await card.getByRole("button", { name: "更多地图工具" }).click()
        await page
          .getByLabel("更多地图工具内容")
          .getByRole("button", { name: "查看地图数据来源" })
          .click()
        const dialog = page.getByRole("dialog")
        await expect(dialog).toBeVisible()
        await page.keyboard.press("Escape")
        await expect(dialog).toHaveCount(0)
        await aligned()
        await expect(card.getByText(label, { exact: true })).toBeVisible()
      }
    )
  }

  test("keeps DOM search usable across fallback devices @app-iphone @app-landscape @app-android @app-webkit", async ({
    page,
    api,
  }, testInfo) => {
    installMapMocks(api)
    await page.goto("/community/exchange")
    await applySafeArea(page)
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({
      timeout: 15_000,
    })
    const card = page.getByRole("region", { name: "地点查找" })
    await expect(card).toBeVisible()
    await expect(card).not.toHaveAttribute("data-native-search", "true")
    await expect
      .poll(() =>
        card.evaluate((element) => {
          const capsule = element
            .querySelector(".exchange-search-surface")!
            .getBoundingClientRect()
          const tools = element
            .querySelector(".exchange-search-tools")!
            .getBoundingClientRect()
          const gapHit = document.elementFromPoint(
            capsule.x + capsule.width / 2,
            (capsule.bottom + tools.top) / 2
          )
          const hostWidth = element.parentElement!.getBoundingClientRect().width
          const navigation = document
            .querySelector("nav > [data-glass-fallback]")
            ?.getBoundingClientRect()
          const expected =
            innerHeight <= 500 && hostWidth >= 640
              ? Math.min(420, Math.max(320, hostWidth * 0.48))
              : hostWidth < 768
                ? innerHeight > innerWidth && navigation
                  ? navigation.width
                  : hostWidth - 16
                : Math.min(560, hostWidth - 16)
          return {
            widthFits: Math.abs(capsule.width - expected) < 1,
            separate: tools.top - capsule.bottom >= 12,
            mapGap: !element.contains(gapHit),
            hits: [
              ...element.querySelectorAll("button"),
              ...document.querySelectorAll(
                "[data-exchange-side-controls] button"
              ),
            ].every((button) => {
              const box = button.getBoundingClientRect()
              return (
                box.width >= 44 &&
                box.height >= 44 &&
                box.top >= 0 &&
                box.bottom <= innerHeight &&
                button.contains(
                  document.elementFromPoint(
                    box.x + box.width / 2,
                    box.y + box.height / 2
                  )
                )
              )
            }),
          }
        })
      )
      .toEqual({ widthFits: true, separate: true, mapGap: true, hits: true })
    await page.screenshot({ path: testInfo.outputPath("a-dom-browse.png") })
    const search = card.getByRole("button", { name: "查找地点" })
    await search.click()
    await expect(page.getByRole("navigation", { name: "主导航" })).toBeHidden()
    const input = card.getByRole("textbox", { name: "搜索地点" })
    await expect(input).toBeFocused()
    await input.fill("上")
    await expect(
      card.getByRole("button", { name: "查找", exact: true })
    ).toBeDisabled()
    await input.fill("上海场馆")
    await card.getByRole("button", { name: "展开结果" }).click()
    await expect(card).toHaveAttribute("data-detent", "large")
    await card.getByRole("button", { name: "取消" }).click()
    await expect(search).toBeFocused()
    await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible()
    await search.click()
    await expect(input).toHaveValue("上海场馆")
    await card.getByRole("button", { name: "清除搜索文字" }).click()
    await expect(input).toHaveValue("")
    await card.getByRole("button", { name: "取消" }).click()
    const shape = await card.evaluate((element) => ({
      radius: getComputedStyle(
        element.querySelector(".exchange-search-surface")!
      ).borderTopLeftRadius,
      box: element.getBoundingClientRect().toJSON(),
    }))
    expect(shape.radius).toBe("34px")
    expect(shape.box.left).toBeGreaterThanOrEqual(0)
    expect(shape.box.right).toBeLessThanOrEqual(page.viewportSize()!.width)
  })
  test(
    "selects a searched place without leaving the map and clears its marker",
    { tag: ["@app-iphone", "@app-landscape"] },
    async ({ page, api }, testInfo) => {
      const bounds = installMapMocks(api)
      api.expect({
        name: "App explicit place search",
        method: "GET",
        path: "/api/community/exchange/places/search",
        query: fudabaPlaceSearchQuerySchema,
        responses: { 200: fudabaPlaceSearchResponseSchema },
        times: 1,
        handle: () => ({
          status: 200,
          json: {
            success: true,
            items: [
              {
                id: "way:307455604",
                label: "西岸艺术中心",
                address: "上海市徐汇区西岸艺术中心",
                city: "上海市",
                location: {
                  latitude: 31.1693193,
                  longitude: 121.457005,
                  precision: "exact",
                },
              },
            ],
            attribution: "© OpenStreetMap contributors",
          },
        }),
      })
      await page.goto("/community/exchange")
      await expect(page.locator("[data-exchange-office-map]")).toHaveAttribute(
        "data-map-state",
        "ready",
        { timeout: 15_000 }
      )
      await applySafeArea(page)
      const trigger = page.getByRole("button", {
        name: "查找地点",
        exact: true,
      })
      await trigger.click()
      const query = page.getByRole("textbox", { name: "搜索地点" })
      await query.fill("西岸艺术中心")
      await page.screenshot({
        path: testInfo.outputPath("app-map-search-edit.png"),
      })
      await page.getByRole("button", { name: "查找", exact: true }).click()
      const result = page.getByRole("button", {
        name: /西岸艺术中心.*上海市徐汇区/,
      })
      await expect(result).toBeVisible()
      await expect(
        page.getByText("© OpenStreetMap contributors", { exact: true })
      ).toHaveCount(0)
      const box = await result.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(
        page.viewportSize()!.width
      )
      expect(box!.y + box!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height
      )
      await page.screenshot({
        path: testInfo.outputPath("app-map-search-results.png"),
      })
      await result.click()
      await expect(
        page.getByRole("button", { name: "已定位：西岸艺术中心，展开地点查找" })
      ).toBeFocused()
      await expect(
        page.getByRole("img", { name: "搜索地点：西岸艺术中心" })
      ).toBeVisible()
      await expect
        .poll(() =>
          bounds.some((value) => {
            const [west, south, east, north] = value.split(",").map(Number)
            return (
              west < 121.457005 &&
              east > 121.457005 &&
              south < 31.1693193 &&
              north > 31.1693193 &&
              east - west < 1
            )
          })
        )
        .toBe(true)
      await page.screenshot({
        path: testInfo.outputPath("app-map-selected-place.png"),
      })
      await expect(
        page.getByText("© OpenStreetMap contributors", { exact: true })
      ).toHaveCount(0)
      const more = page.getByRole("button", { name: "更多地图工具" })
      await more.click()
      await page.getByRole("button", { name: "查看地图数据来源" }).click()
      const source = page.getByRole("dialog", { name: "地图数据来源" })
      await expect(source).toBeVisible()
      await expect(
        source.getByText("© OpenStreetMap contributors", { exact: true })
      ).toBeVisible()
      await expect(
        source.getByRole("link", { name: "DataV GeoAtlas" })
      ).toBeVisible()
      await expect(page.getByRole("region", { name: "地点查找" })).toBeHidden()
      await page.keyboard.press("Escape")
      await expect(source).toHaveCount(0)
      await expect(more).toBeFocused()
      await page.getByRole("button", { name: "清除搜索地点" }).click()
      await expect(
        page.getByRole("img", { name: "搜索地点：西岸艺术中心" })
      ).toHaveCount(0)
    }
  )

  test(
    "uses browser geolocation to return to the current position",
    {
      tag: ["@app-iphone", "@app-landscape"],
    },
    async ({ context, page, api }) => {
      installMapMocks(api)
      await context.grantPermissions(["geolocation"])
      await context.setGeolocation({
        longitude: 121.473701,
        latitude: 31.230416,
      })
      await page.goto("/community/exchange")

      const canvas = page.locator("canvas.maplibregl-canvas")
      await expect(canvas).toBeVisible({ timeout: 15_000 })
      await page.getByRole("button", { name: "回到我的位置" }).click()

      await expect(page.getByText("已回到您的位置")).toBeAttached()
      const marker = page.getByRole("img", { name: "您的当前位置" })
      await expect(marker).toBeVisible()
      await expect
        .poll(async () => {
          const [canvasBox, markerBox] = await Promise.all([
            canvas.boundingBox(),
            marker.boundingBox(),
          ])
          if (!canvasBox || !markerBox) return false
          const horizontalDistance = Math.abs(
            canvasBox.x +
              canvasBox.width / 2 -
              (markerBox.x + markerBox.width / 2)
          )
          const verticalDistance = Math.abs(
            canvasBox.y +
              canvasBox.height / 2 -
              (markerBox.y + markerBox.height / 2)
          )
          return horizontalDistance < 2 && verticalDistance < 2
        })
        .toBe(true)
    }
  )

  test(
    "renders the exchange map behind non-overlapping local and global controls",
    {
      tag: ["@app-iphone", "@app-landscape"],
    },
    async ({ page, api }, testInfo) => {
      installMapMocks(api)
      await page.goto("/community/exchange")
      await applySafeArea(page)

      const canvas = page.locator("canvas.maplibregl-canvas")
      await expect(canvas).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole("banner")).toHaveCount(0)

      const globalNavigation = page.getByRole("navigation", { name: "主导航" })
      await expect(
        globalNavigation.getByRole("link", { name: "交换地图", exact: true })
      ).toHaveAttribute("aria-current", "page")

      const toolTrigger = page.getByRole("button", { name: "更多地图工具" })
      await expect(toolTrigger).toHaveAccessibleName("更多地图工具")
      await expect(toolTrigger).toBeVisible()
      await toolTrigger.click()
      await expect(toolTrigger).toHaveAttribute("aria-expanded", "true")
      const toolbar = page.getByRole("region", { name: "地点查找" })
      await expect(toolbar).toBeVisible()
      await expect(
        toolbar.getByRole("button", { name: "打开筛选" })
      ).toBeVisible()
      await expect(
        toolbar.getByRole("button", { name: "打开事务所名录" })
      ).toBeVisible()
      await expect(
        toolbar.getByRole("button", { name: "打开名片名录" })
      ).toBeVisible()

      // The attribution entry lives in the same folding panel and opens the one
      // shared dialog. The panel collapses on the same click, so focus returns
      // to the always-visible menu trigger rather than the hidden entry.
      const attributionEntry = toolbar.getByRole("button", {
        name: "查看地图数据来源",
      })
      await expect(attributionEntry).toBeVisible()
      await expect(attributionEntry).toHaveAttribute("aria-haspopup", "dialog")
      await attributionEntry.click()
      const attributionDialog = page.getByRole("dialog", {
        name: "地图数据来源",
      })
      await expect(attributionDialog).toBeVisible()
      await expect(
        attributionDialog.getByRole("link", { name: "DataV GeoAtlas" })
      ).toHaveAttribute(
        "href",
        "https://datav.aliyun.com/portal/school/atlas/area_selector"
      )
      await page.keyboard.press("Escape")
      await expect(attributionDialog).toHaveCount(0)
      await expect(toolTrigger).toBeFocused()

      await expect
        .poll(async () => {
          const [tools, navigation] = await Promise.all([
            toolTrigger.boundingBox(),
            globalNavigation.boundingBox(),
          ])
          if (!tools || !navigation) return false
          return tools.y + tools.height <= navigation.y
        })
        .toBe(true)

      await expect
        .poll(async () => {
          const screenshot = await canvas.screenshot()
          return page.evaluate(async (base64) => {
            const image = new Image()
            image.src = `data:image/png;base64,${base64}`
            await image.decode()
            const probe = document.createElement("canvas")
            probe.width = image.naturalWidth
            probe.height = image.naturalHeight
            const context = probe.getContext("2d", { willReadFrequently: true })
            if (!context || !probe.width || !probe.height) return false
            context.drawImage(image, 0, 0)
            const pixels = context.getImageData(
              0,
              0,
              probe.width,
              probe.height
            ).data
            for (let index = 0; index < pixels.length; index += 4) {
              if (pixels[index + 3] > 0) return true
            }
            return false
          }, screenshot.toString("base64"))
        })
        .toBe(true)

      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= window.innerWidth &&
            document.documentElement.scrollHeight <= window.innerHeight
        )
      ).toBe(true)

      if (process.env.CAPTURE_APP_QA === "1") {
        await page.screenshot({
          path: testInfo.outputPath(`a-app-map-${testInfo.project.name}.png`),
        })
      }
    }
  )

  test(
    "keeps map filters and camera while switching tabs without scrolling the document",
    {
      tag: "@app-iphone",
    },
    async ({ page, api }, testInfo) => {
      test.skip(
        testInfo.project.name !== "app-iphone",
        "Map tab continuity is covered once in the portrait App project."
      )

      installHomepageLinksMock(api)
      const mapBounds = installMapMocks(api)
      await page.goto("/")

      const globalNavigation = page.getByRole("navigation", { name: "主导航" })
      const mapTab = globalNavigation.getByRole("link", {
        name: "交换地图",
        exact: true,
      })
      await expect(globalNavigation.getByRole("link")).toHaveText([
        "首页",
        "社区",
        "交换地图",
        "资料",
        "我的",
      ])
      await mapTab.click()
      await expect(page).toHaveURL(/\/community\/exchange$/)
      await expect(mapTab).toHaveAttribute("aria-current", "page")

      const canvas = page.locator("canvas.maplibregl-canvas")
      await expect(canvas).toBeVisible({ timeout: 15_000 })
      await expect.poll(() => mapBounds.length).toBeGreaterThan(0)

      const toolTrigger = page.getByRole("button", { name: "更多地图工具" })
      await toolTrigger.click()
      await page
        .getByRole("region", { name: "地点查找" })
        .getByRole("button", { name: "打开筛选" })
        .click()
      const filterDialog = page.getByRole("dialog", { name: "筛选地图" })
      await expect(filterDialog).toBeVisible()
      const seriesFilter = filterDialog.getByRole("button", {
        name: /765PRO/,
      })
      await seriesFilter.click()
      await expect(seriesFilter).toHaveAttribute("aria-pressed", "true")
      await expect
        .poll(() => new URL(page.url()).searchParams.getAll("series"))
        .toEqual(["765"])
      await page.keyboard.press("Escape")
      await expect(filterDialog).toHaveCount(0)

      const requestCountBeforeZoom = mapBounds.length
      // The +/− control is gone, so the camera change is driven by the
      // double-click gesture that MapLibre's default `doubleClickZoom` owns.
      // `scrollZoom` also zooms, but a wheel event carries a delta the handler
      // scales per event, while a double click is one discrete, repeatable
      // action on the emulated touch device this project runs.
      await canvas.dblclick()
      await expect
        .poll(() => mapBounds.length)
        .toBeGreaterThan(requestCountBeforeZoom)
      const readStoredZoom = () =>
        page.evaluate(() => {
          const stored = sessionStorage.getItem("ims:community-exchange-map")
          return stored ? JSON.parse(stored).viewport?.zoom : null
        })
      await expect.poll(readStoredZoom).toBeGreaterThan(4.05)

      // The removed +/− buttons were also the only pointer-free zoom entry, so
      // the keyboard path is asserted here: MapLibre's keyboard handler owns the
      // `=` / `+` keys while the canvas holds focus. Pinch has no automated
      // substitute; its handler is covered by the component's gesture guard.
      await canvas.focus()
      const zoomBeforeKeyboard = await readStoredZoom()
      await page.keyboard.press("Equal")
      await expect.poll(readStoredZoom).toBeGreaterThan(zoomBeforeKeyboard)

      const zoomedBounds = mapBounds.at(-1)
      expect(zoomedBounds).toBeTruthy()
      const preservedMapState = await page.evaluate(() =>
        JSON.parse(
          sessionStorage.getItem("ims:community-exchange-map") ?? "null"
        )
      )

      await globalNavigation
        .getByRole("link", { name: "我的", exact: true })
        .click()
      await expect(page).toHaveURL(/\/account\/me$/)
      await expect(
        page.getByRole("heading", { name: "我的", exact: true, level: 1 })
      ).toBeVisible()

      const requestCountBeforeReturn = mapBounds.length
      await mapTab.click()
      await expect
        .poll(() => new URL(page.url()).searchParams.getAll("series"))
        .toEqual(["765"])
      await expect(canvas).toBeVisible({ timeout: 15_000 })
      await expect
        .poll(() => mapBounds.length)
        .toBeGreaterThan(requestCountBeforeReturn)
      await expect.poll(() => mapBounds.at(-1)).toBe(zoomedBounds)
      expect(
        await page.evaluate(() =>
          JSON.parse(
            sessionStorage.getItem("ims:community-exchange-map") ?? "null"
          )
        )
      ).toEqual(preservedMapState)

      const routeBeforeReselection = page.url()
      const historyLength = await page.evaluate(() => history.length)
      await page.evaluate(() => {
        const originalScrollTo = window.scrollTo.bind(window)
        Reflect.set(window, "__imsMapDocumentScrollCalls", 0)
        window.scrollTo = ((...args: Parameters<typeof window.scrollTo>) => {
          Reflect.set(
            window,
            "__imsMapDocumentScrollCalls",
            Number(Reflect.get(window, "__imsMapDocumentScrollCalls")) + 1
          )
          Reflect.apply(originalScrollTo, window, args)
        }) as typeof window.scrollTo
      })
      await mapTab.click()
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      expect(page.url()).toBe(routeBeforeReselection)
      expect(await page.evaluate(() => history.length)).toBe(historyLength)
      expect(
        await page.evaluate(() =>
          Number(Reflect.get(window, "__imsMapDocumentScrollCalls"))
        )
      ).toBe(0)

      await toolTrigger.click()
      await page
        .getByRole("region", { name: "地点查找" })
        .getByRole("button", { name: "打开筛选，已应用筛选" })
        .click()
      await expect(
        page
          .getByRole("dialog", { name: "筛选地图" })
          .getByRole("button", { name: /765PRO/ })
      ).toHaveAttribute("aria-pressed", "true")

      await page.goto("/community/exchange/me")
      await expect(
        globalNavigation.getByRole("link", { name: "我的", exact: true })
      ).toHaveAttribute("aria-current", "page")
      await expect(mapTab).not.toHaveAttribute("aria-current", "page")
    }
  )

  test(
    "exposes directory refresh on first usable paint with adaptive map chrome",
    {
      tag: ["@app-iphone", "@app-landscape", "@app-android", "@app-webkit"],
    },
    async ({ page, api }, testInfo) => {
      installMapMocks(api)
      await page.goto("/community/exchange")
      await applySafeArea(page)
      const refresh = page.getByRole("button", { name: "刷新名录" })
      await expect(refresh).toBeVisible()
      await expect(refresh).toBeEnabled()
      await expect(page.getByLabel("更多地图工具内容")).toHaveCount(0)
      await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({
        timeout: 15_000,
      })

      // This browser case verifies the DOM fallback shape. The dedicated UIKit
      // search renderer needs its own simulator or device visual evidence.
      await expect(refresh).toBeVisible()
      const shape = await refresh.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return {
          width: rect.width,
          height: rect.height,
          radius: Number.parseFloat(
            window.getComputedStyle(element).borderTopLeftRadius
          ),
        }
      })

      expect(shape.width).toBe(shape.height)
      expect(shape.width).toBeGreaterThanOrEqual(44)
      expect(shape.radius).toBeGreaterThanOrEqual(shape.width / 2)
      const card = page.getByRole("region", { name: "地点查找" })
      const assertSideMaterial = async () => {
        const material = await page
          .locator("[data-exchange-side-controls]")
          .evaluate((group) => {
            const refresh = group.querySelector<HTMLElement>(
              ".exchange-map-refresh"
            )!
            const locate = group.querySelector<HTMLElement>(
              '[data-native-glass-control="locate"]'
            )!
            const groupStyle = getComputedStyle(group)
            const groupBox = group.getBoundingClientRect()
            const transparent = (element: Element) =>
              getComputedStyle(element).backgroundColor === "rgba(0, 0, 0, 0)"
            const hit = (button: Element) => {
              const rect = button.getBoundingClientRect()
              return [
                [rect.x + rect.width / 2, rect.y + rect.height / 2],
                [rect.x + 4, rect.y + rect.height / 2],
                [rect.right - 4, rect.y + rect.height / 2],
              ].every(([x, y]) =>
                button.contains(document.elementFromPoint(x, y))
              )
            }
            const corner = document.elementFromPoint(
              groupBox.x + 1,
              groupBox.y + 1
            )
            return {
              radius: [
                groupStyle.borderTopLeftRadius,
                groupStyle.borderTopRightRadius,
                groupStyle.borderBottomLeftRadius,
                groupStyle.borderBottomRightRadius,
              ],
              groupPaints: !transparent(group),
              childrenTransparent: transparent(refresh) && transparent(locate),
              childBlur: getComputedStyle(locate).backdropFilter,
              childBorder: getComputedStyle(locate).borderTopWidth,
              pseudo: ["::before", "::after"].map(
                (pseudo) => getComputedStyle(locate, pseudo).content
              ),
              hits: [...group.querySelectorAll("button")].every(hit),
              cornerPasses: !group.contains(corner),
            }
          })
        expect(material).toEqual({
          radius: ["24px", "24px", "24px", "24px"],
          groupPaints: true,
          childrenTransparent: true,
          childBlur: "none",
          childBorder: "0px",
          pseudo: ["none", "none"],
          hits: true,
          cornerPasses: true,
        })
      }
      const assertLocateClearance = async () => {
        await expect
          .poll(() =>
            card.evaluate((element) => {
              const locate = document.querySelector<HTMLElement>(
                '[data-native-glass-control="locate"]'
              )
              if (!locate) return { clear: false, hit: false }
              const surface = element.getBoundingClientRect()
              const control = locate.getBoundingClientRect()
              return {
                clear:
                  control.bottom <= surface.top ||
                  control.left >= surface.right,
                hit: locate.contains(
                  document.elementFromPoint(
                    control.x + control.width / 2,
                    control.y + control.height / 2
                  )
                ),
              }
            })
          )
          .toEqual({ clear: true, hit: true })
      }
      await assertLocateClearance()
      for (const dark of [false, true]) {
        await page.evaluate(
          (dark) => document.documentElement.classList.toggle("dark", dark),
          dark
        )
        await expect(page.getByRole("region", { name: "地点查找" })).toHaveCSS(
          "color-scheme",
          "light"
        )
        await assertSideMaterial()
        await assertLocateClearance()
        await page.screenshot({
          path: testInfo.outputPath(
            `a-dom-${testInfo.project.name}-${dark ? "dark-document" : "light"}.png`
          ),
        })
      }
      await page.evaluate(() =>
        document.documentElement.style.setProperty(
          "--primary",
          "rgb(24, 96, 80)"
        )
      )
      await expect(refresh).toBeVisible()
      await assertLocateClearance()
      await page.screenshot({
        path: testInfo.outputPath(
          `a-dom-${testInfo.project.name}-custom-palette.png`
        ),
      })
      const nativeTwin = await page.evaluate(() => {
        const locate = document.querySelector<HTMLElement>(
          '[data-native-glass-control="locate"]'
        )!
        document.documentElement.dataset.nativeGlass = "controls"
        const hidden = locate.getClientRects().length === 0
        const display = locate.style.display
        const visibility = locate.style.visibility
        locate.style.display = "block"
        locate.style.visibility = "hidden"
        const frame = locate.getBoundingClientRect()
        const radius = getComputedStyle(locate).borderTopLeftRadius
        locate.style.display = display
        locate.style.visibility = visibility
        const restoredHidden = locate.getClientRects().length === 0
        const group = document.querySelector<HTMLElement>(
          "[data-exchange-side-controls]"
        )!
        const standalone = group.getBoundingClientRect()
        const refreshRadius = getComputedStyle(
          group.querySelector(".exchange-map-refresh-button")!
        ).borderBottomLeftRadius
        delete document.documentElement.dataset.nativeGlass
        return {
          hidden,
          restoredHidden,
          measured: { width: frame.width, height: frame.height, radius },
          standalone: {
            width: standalone.width,
            height: standalone.height,
            refreshRadius,
          },
        }
      })
      expect(nativeTwin).toEqual({
        hidden: true,
        restoredHidden: true,
        measured: { width: 48, height: 48, radius: "24px" },
        standalone: { width: 48, height: 48, refreshRadius: "24px" },
      })
      await page.getByRole("button", { name: "更多地图工具" }).click()
      await expect(page.getByRole("button", { name: "刷新名录" })).toHaveCount(
        1
      )
      await expect(
        page
          .getByLabel("更多地图工具内容")
          .getByRole("button", { name: "刷新名录" })
      ).toHaveCount(0)
    }
  )
})
