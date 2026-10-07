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
      !["app-iphone", "app-landscape"].includes(testInfo.project.name),
    "Map canvas geometry is covered on one portrait and one landscape device."
  )
  test.setTimeout(45_000)
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
})

test.describe("app map", () => {
  test("keeps DOM search usable across fallback devices @app-iphone @app-landscape @app-android @app-webkit", async ({
    page,
    api,
  }) => {
    installMapMocks(api)
    await page.goto("/community/exchange")
    await applySafeArea(page)
    await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({
      timeout: 15_000,
    })
    const card = page.getByRole("region", { name: "地点查找" })
    await expect(card).toBeVisible()
    await expect(card).not.toHaveAttribute("data-native-search", "true")
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
      radius: getComputedStyle(element).borderTopLeftRadius,
      box: element.getBoundingClientRect().toJSON(),
    }))
    expect(shape.radius).toBe("28px")
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
      await page.getByRole("button", { name: "查找", exact: true }).click()
      await expect(
        page.getByText("© OpenStreetMap contributors", { exact: true })
      ).toBeVisible()
      const result = page.getByRole("button", {
        name: /西岸艺术中心.*上海市徐汇区/,
      })
      await expect(result).toBeVisible()
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
      await expect(trigger).toBeFocused()
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
          path: `/tmp/imsweb-app-map-${testInfo.project.name}.png`,
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
    "renders the app search More action as a 44px circle",
    {
      tag: ["@app-iphone", "@app-landscape"],
    },
    async ({ page, api }) => {
      installMapMocks(api)
      await page.goto("/community/exchange")
      await applySafeArea(page)
      await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({
        timeout: 15_000,
      })

      // This browser case verifies the DOM fallback shape. The dedicated UIKit
      // search renderer needs its own simulator or device visual evidence.
      const refresh = page.getByRole("button", { name: "更多地图工具" })
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
    }
  )
})
