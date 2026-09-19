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
    !["app-iphone", "app-landscape"].includes(testInfo.project.name),
    "Map canvas geometry is covered on one portrait and one landscape device."
  )
  test.setTimeout(45_000)
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
})

test.describe("app map", () => {
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

      const toolTrigger = page.locator(
        'button[aria-controls="exchange-map-tools"]'
      )
      await expect(toolTrigger).toHaveAccessibleName("展开地图工具")
      await expect(toolTrigger).toBeVisible()
      await toolTrigger.click()
      await expect(toolTrigger).toHaveAccessibleName("收起地图工具")
      const toolbar = page.getByRole("toolbar", { name: "交换地图工具" })
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

      const toolTrigger = page.locator(
        'button[aria-controls="exchange-map-tools"]'
      )
      await toolTrigger.click()
      await page
        .getByRole("toolbar", { name: "交换地图工具" })
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
        .getByRole("toolbar", { name: "交换地图工具" })
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
    "renders the app map refresh control as a circle",
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

      // The control stands alone above the map on the app target, so it reads as a
      // circle like the locate and map-tool controls, not as a rounded square. The
      // native glass overlay measures this radius from the DOM twin, so the
      // computed radius is what decides the drawn shape too.
      const refresh = page.getByRole("button", { name: "刷新交换区" })
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
      expect(shape.radius).toBeGreaterThanOrEqual(shape.width / 2)
    }
  )
})
