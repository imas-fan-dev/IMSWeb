import AxeBuilder from "@axe-core/playwright"
import { api, expect, test } from "./fixtures/test"

import { installBrowserIconMock } from "./fixtures/homepage"

const series = {
  items: [
    {
      id: 1,
      code: "765",
      displayName: "765PRO",
      color: "#f34f6d",
      iconUrl: "/brand/series/wall/765pro.webp",
      imageTransform: {
        fit: "contain",
        focalX: 0.5,
        focalY: 0.5,
        zoom: 1,
        rotation: 0,
      },
      displayOrder: 0,
      activeOfficeCount: 2,
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
  ],
}

const directoryOffice = {
  id: "office-1",
  slug: "shanghai-weekend",
  name: "上海周末交换事务所",
  intro: "每周末开放的线下交换点。",
  city: "上海",
  address: "西岸艺术中心入口",
  accent: "#f34e6c",
  coverUrl: null,
  isOpen: true,
  visitorCount: 21,
  seriesCodes: ["765"],
}

const mapOffices = [
  {
    id: "office-1",
    slug: "shanghai-weekend",
    name: "上海周末交换事务所",
    city: "上海",
    address: "西岸艺术中心入口",
    accent: "#f34e6c",
    isOpen: true,
    seriesCodes: ["765"],
    location: {
      latitude: 31.2,
      longitude: 121.5,
      precision: "exact",
    },
  },
  {
    id: "office-2",
    slug: "shanghai-event",
    name: "上海活动交换事务所",
    city: "上海",
    address: "上海世博文化公园北门",
    accent: "#2581c7",
    isOpen: false,
    seriesCodes: ["cg"],
    location: {
      latitude: 31.2,
      longitude: 121.5,
      precision: "exact",
    },
  },
]

const card = {
  id: "card-1",
  producerName: "春香P",
  displayName: "周末交换会名片",
  seriesCode: "765",
  favoriteCharacter: "天海春香",
  favoriteCharacters: [{ id: 1, name: "天海春香", seriesCode: "765" }],
  frontImageUrl: "/brand/series/wall/765pro.webp",
  backImageUrl: "/brand/series/wall/cinderella-girls.webp",
  accent: "#f34e6c",
  bio: "上海地区制作人",
  tradeNote: "现场交换同系列名片",
  available: true,
  source: null,
  createdAt: "2026-08-02T08:00:00.000Z",
  interactions: {
    likes: 12,
    favorites: 4,
    viewerLiked: false,
    viewerFavorited: false,
  },
}

test.beforeEach(async ({ page, api }, testInfo) => {
  test.skip(
    testInfo.project.name === "firefox-desktop" &&
      testInfo.title.startsWith("fills the public workspace"),
    "GitHub headless Firefox does not provide a stable MapLibre WebGL canvas"
  )
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
  await page.route(
    (url) =>
      ["http:", "https:"].includes(url.protocol) &&
      !["127.0.0.1", "localhost"].includes(url.hostname),
    (route) => route.abort("blockedbyclient")
  )
  await installBrowserIconMock(api)
  await api.mockRoute(
    "/api/community/exchange/cards/card-1/reactions",
    (route) =>
      route.fulfill({
        json: { success: true, cardId: "card-1", reactions: [] },
      }),
    "GET",
    { min: 0, max: 1 }
  )
  await api.mockRoute(
    "**/api/community/exchange/offices/shanghai-weekend",
    async (route) => {
      await route.fulfill({
        json: { office: { ...directoryOffice, cards: [] } },
      })
    },
    "GET",
    { min: 0, max: 1 }
  )
  await api.mockRoute(
    "**/api/community/exchange/series",
    async (route) => {
      await route.fulfill({ json: series })
    },
    "GET",
    { min: 1, max: 5 }
  )
  await api.mockRoute(
    "**/api/community/exchange/offices?*",
    async (route) => {
      await route.fulfill({
        json: {
          items: [directoryOffice],
          pageInfo: { hasNextPage: false, nextCursor: null },
        },
      })
    },
    "GET",
    { min: 1, max: 4 }
  )
  await api.mockRoute(
    "**/api/community/exchange/cards?*",
    async (route) => {
      await route.fulfill({
        json: {
          items: [card],
          pageInfo: { hasNextPage: false, nextCursor: null },
        },
      })
    },
    "GET",
    { min: 1, max: 4 }
  )
})

test.describe("community exchange map", () => {
  test("retains exact published points and groups only identical coordinates of the same precision", async ({
    page,
    api,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    const exact = {
      ...mapOffices[0]!,
      id: "exact-office",
      name: "精确交换事务所",
      location: {
        latitude: 31.20001,
        longitude: 121.50001,
        precision: "exact",
      },
    }
    const records = [
      mapOffices[0]!,
      exact,
      { ...exact, id: "same-exact", name: "同点精确事务所" },
      {
        ...exact,
        id: "nearby-exact",
        name: "附近精确事务所",
        location: { ...exact.location, longitude: 121.50002 },
      },
      {
        ...exact,
        id: "exact-grid",
        name: "同格精确事务所",
        location: { latitude: 31.2, longitude: 121.5, precision: "exact" },
      },
    ]
    await api.mockRoute(
      "/api/community/exchange/map/config",
      (route) =>
        route.fulfill({
          json: {
            provider: "maplibre",
            search: { provider: "nominatim" },
            styleUrl: "/maps/exchange-test-style.json",
          },
        }),
      "GET"
    )
    await api.mockRoute(
      "**/api/community/exchange/map/offices?*",
      (route) => route.fulfill({ json: { items: records, truncated: false } }),
      "GET",
      { min: 1, max: 4 }
    )
    await api.mockRoute(
      "**/api/community/exchange/places/search?*",
      (route) =>
        route.fulfill({
          json: {
            success: true,
            items: [
              {
                id: "exact-test-position",
                label: "精确测试位置",
                address: "测试选点",
                city: "上海市",
                location: exact.location,
              },
            ],
            attribution: "© OpenStreetMap contributors",
          },
        }),
      "GET",
      1
    )
    await page.goto("/community/exchange")
    await expect(page.locator("[data-map-office-count]")).toHaveText("5")
    await page.getByRole("button", { name: "展开地图面板" }).click()
    await page.getByRole("tab", { name: "地点", exact: true }).click()
    const query = page.getByRole("textbox", { name: "搜索地点" })
    await query.fill("精确测试位置")
    await query.press("Enter")
    await page
      .getByRole("button", { name: "精确测试位置 测试选点", exact: true })
      .click()
    await expect(
      page.getByRole("status").filter({ hasText: "已定位：精确测试位置" })
    ).toBeVisible()
    const exactMarker = page.locator(
      '[data-map-office-group="exact:31.20001,121.50001"]'
    )
    await expect(exactMarker).toHaveAttribute(
      "aria-label",
      "精确交换事务所、同点精确事务所，2 个事务所"
    )
    await expect(
      page.locator('[data-map-office-group="exact:31.20001,121.50002"]')
    ).toHaveCount(1)
    await expect(
      page.locator('[data-map-office-group="exact:31.2,121.5"]')
    ).toHaveCount(1)
    await expect(page.locator("[data-map-office-group]")).toHaveCount(3)
  })

  test("retains committed counts and cluster nodes through a real pan and equal response @mobile", async ({
    page,
    api,
  }, testInfo) => {
    const records = [
      mapOffices[0]!,
      {
        ...mapOffices[1]!,
        location: { latitude: 31.3, longitude: 121.6, precision: "exact" },
      },
    ]
    let requests = 0
    let hold = false
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await api.mockRoute(
      "/api/community/exchange/map/config",
      (route) =>
        route.fulfill({
          json: {
            provider: "maplibre",
            search: { provider: "nominatim" },
            styleUrl: "/maps/exchange-test-style.json",
          },
        }),
      "GET",
      1
    )
    await api.mockRoute(
      "**/api/community/exchange/map/offices?*",
      async (route) => {
        requests++
        if (hold) await gate
        return route.fulfill({
          json: {
            items: requests > 1 ? [...records].reverse() : records,
            truncated: false,
          },
        })
      },
      "GET",
      { min: 2, max: 4 }
    )
    try {
      await page.goto("/community/exchange")
      const map = page.getByRole("region", { name: "区域地图", exact: true })
      const count = page.locator("[data-map-office-count]")
      await expect(count).toHaveText("2")
      const cluster = page.getByRole("button", {
        name: "2 个区域点，放大查看",
        exact: true,
      })
      await expect(cluster).toBeVisible()
      const original = await cluster.elementHandle()
      await count.evaluate((element) => {
        const watched = Object.assign(element, { counterWrites: 0 })
        new MutationObserver(() => {
          watched.counterWrites++
        }).observe(element, {
          childList: true,
          characterData: true,
          subtree: true,
        })
      })
      hold = true
      await page.locator("canvas.maplibregl-canvas").press("ArrowRight")
      await expect(map).toHaveAttribute("data-map-results-state", "loading")
      await expect(count).toHaveText("2")
      expect(
        await cluster.evaluate(
          (element, previous) => element === previous,
          original
        )
      ).toBe(true)
      release()
      await expect(map).toHaveAttribute("data-map-results-state", "ready")
      await page.getByRole("button", { name: "更多地图工具" }).click()
      await page.getByRole("menuitem", { name: "打开事务所名录" }).click()
      await expect(
        page.getByRole("dialog", { name: "公开交换名录" })
      ).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(
        page.getByRole("dialog", { name: "公开交换名录" })
      ).toHaveCount(0)
      expect(
        await cluster.evaluate(
          (element, previous) => element === previous,
          original
        )
      ).toBe(true)
      expect(
        await count.evaluate((element) => Reflect.get(element, "counterWrites"))
      ).toBe(0)
      await page.screenshot({
        path: testInfo.outputPath("stable-count-after-pan.png"),
      })
      await page.getByRole("button", { name: "范围内事务所列表" }).click()
      await page
        .getByRole("region", { name: "当前范围事务所列表" })
        .getByRole("link", { name: /上海周末交换事务所/ })
        .click()
      const selected = page.getByRole("button", {
        name: "上海周末交换事务所，1 个事务所",
        exact: true,
      })
      await expect(selected).toHaveAttribute("aria-pressed", "true")
      const popup = page.getByRole("dialog", { name: "事务所详情" })
      await expect(
        popup.getByRole("heading", { name: "上海周末交换事务所" })
      ).toBeVisible()
      await page.getByRole("button", { name: "范围内事务所列表" }).click()
      await page
        .getByRole("region", { name: "当前范围事务所列表" })
        .getByRole("link", { name: /上海周末交换事务所/ })
        .click()
      await expect(
        popup.getByRole("heading", { name: "事务所详情", exact: true })
      ).toBeFocused()
      await popup.getByRole("button", { name: "关闭事务所详情" }).click()
      await expect(cluster).toBeVisible()
      expect(
        await count.evaluate((element) => Reflect.get(element, "counterWrites"))
      ).toBe(0)
    } finally {
      release()
    }
  })

  test(
    "searches a place explicitly and recenters the public map",
    { tag: "@mobile" },
    async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name === "firefox-desktop",
        "MapLibre success requires stable WebGL"
      )
      await api.mockRoute(
        "/api/community/exchange/map/config",
        (route) =>
          route.fulfill({
            json: {
              provider: "maplibre",
              search: { provider: "nominatim" },
              styleUrl: "/maps/exchange-test-style.json",
            },
          }),
        "GET"
      )
      const mapQueries: URL[] = []
      await api.mockRoute(
        "**/api/community/exchange/map/offices?*",
        (route) => {
          mapQueries.push(new URL(route.request().url()))
          return route.fulfill({ json: { items: [], truncated: false } })
        },
        "GET",
        { min: 2, max: 8 }
      )
      const placeQueries: string[] = []
      await api.mockRoute(
        "**/api/community/exchange/places/search?*",
        (route) => {
          placeQueries.push(
            new URL(route.request().url()).searchParams.get("q") ?? ""
          )
          return route.fulfill({
            json: {
              success: true,
              items: [
                {
                  id: "relation:913067",
                  label: "上海市",
                  address: "上海市, 中国",
                  city: "上海市",
                  location: {
                    latitude: 31.2312707,
                    longitude: 121.4700152,
                    precision: "exact",
                  },
                },
              ],
              attribution: "© OpenStreetMap contributors",
            },
          })
        },
        "GET",
        1
      )
      await page.goto("/community/exchange/")
      await expect(page.locator("[data-exchange-office-map]")).toHaveAttribute(
        "data-map-state",
        "ready",
        { timeout: 15_000 }
      )
      const query = page.getByRole("textbox", { name: "搜索地点" })
      await page.getByRole("button", { name: "展开地图面板" }).click()
      await page.getByRole("tab", { name: "地点", exact: true }).click()
      await expect(query).toBeVisible()
      await query.fill("上海市")
      expect(placeQueries).toHaveLength(0)
      await query.press("Enter")
      const result = page.getByRole("button", {
        name: "上海市 上海市, 中国",
        exact: true,
      })
      await expect(result).toBeVisible()
      expect(placeQueries).toEqual(["上海市"])
      await result.click()
      await expect(query).toBeFocused()
      await expect(
        page.getByRole("status").filter({ hasText: "已定位：上海市" })
      ).toBeVisible()
      await expect(
        page.getByRole("img", { name: "搜索地点：上海市" })
      ).toBeVisible()
      await expect
        .poll(() =>
          mapQueries.some((url) => {
            const [west, south, east, north] = (
              url.searchParams.get("bbox") ?? ""
            )
              .split(",")
              .map(Number)
            return (
              west < 121.4700152 &&
              east > 121.4700152 &&
              south < 31.2312707 &&
              north > 31.2312707 &&
              east - west < 1
            )
          })
        )
        .toBe(true)
      const geometry = await query.boundingBox()
      expect(geometry).not.toBeNull()
      expect(geometry!.x).toBeGreaterThanOrEqual(0)
      expect(geometry!.x + geometry!.width).toBeLessThanOrEqual(
        page.viewportSize()!.width
      )
      await page.getByRole("button", { name: "清除搜索地点" }).click()
      await expect(
        page.getByRole("img", { name: "搜索地点：上海市" })
      ).toHaveCount(0)
    }
  )

  test(
    "fills the public workspace with a responsive map and keeps both directories reachable",
    {
      tag: "@mobile",
    },
    async ({ page, isMobile }, testInfo) => {
      test.slow()
      if (!isMobile) await page.setViewportSize({ width: 1280, height: 800 })
      await api.mockRoute(
        "/api/community/exchange/map/config",
        (route) =>
          route.fulfill({
            json: {
              provider: "maplibre",
              search: { provider: "nominatim" },
              styleUrl: "/maps/exchange-test-style.json",
            },
          }),
        "GET"
      )
      const requests: string[] = []
      const externalRequests: string[] = []
      const consoleErrors: string[] = []
      const controlledWarnings: string[] = []
      page.on("request", (request) => {
        const url = new URL(request.url())
        requests.push(url.href)
        if (
          ["http:", "https:"].includes(url.protocol) &&
          !["127.0.0.1", "localhost"].includes(url.hostname)
        ) {
          externalRequests.push(url.href)
        }
      })
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text())
        if (/controlled|uncontrolled/i.test(message.text())) {
          controlledWarnings.push(message.text())
        }
      })
      await api.mockRoute(
        "**/api/community/exchange/map/offices?*",
        async (route) => {
          await route.fulfill({ json: { items: mapOffices, truncated: false } })
        },
        "GET",
        { min: 3, max: 11 }
      )

      await page.goto("/community/exchange/?view=map&bbox=100,20,130,45")
      await expect(page).not.toHaveURL(/bbox=/)
      await expect(page).not.toHaveURL(/view=/)
      expect(new URL(page.url()).pathname).toBe("/community/exchange/")

      const canvas = page.locator("canvas.maplibregl-canvas")
      await expect(canvas).toBeVisible({ timeout: 15_000 })
      // Zoom and attribution are gestures/content, not MapLibre control widgets:
      // the map must render none of the built-in control groups.
      await expect(page.locator(".maplibregl-ctrl-group")).toHaveCount(0)
      await expect(page.locator(".maplibregl-ctrl-attrib")).toHaveCount(0)
      await expect(
        page.getByRole("button", { name: "回到我的位置" })
      ).toBeVisible()
      expect(requests.some((url) => url.includes("/exchange/map/config"))).toBe(
        true
      )
      await expect
        .poll(() =>
          requests.some((url) => /maplibre-gl(?:-csp)?-worker/.test(url))
        )
        .toBe(true)

      if (!isMobile) {
        await page.getByRole("button", { name: "更多地图工具" }).click()
        await page.getByRole("menuitem", { name: "打开筛选" }).click()
        const agencyChannel = page.getByRole("button", { name: /765PRO/ })
        await expect(agencyChannel.locator("img")).toHaveAttribute(
          "src",
          "/brand/series/wall/765pro.webp"
        )
        await agencyChannel.click()
        await expect(page).toHaveURL(/series=765/)
        await expect
          .poll(() =>
            requests
              .filter((url) =>
                url.includes("/api/community/exchange/map/offices?")
              )
              .some((url) => new URL(url).searchParams.get("series") === "765")
          )
          .toBe(true)
        await page.keyboard.press("Escape")
      }

      const groupMarker = page
        .getByLabel("区域事务所地图工作面", { exact: true })
        .getByRole("button", {
          name: /上海周末交换事务所、上海活动交换事务所，2 个事务所/,
        })
      await expect(groupMarker).toBeVisible()
      const pointCount = page.locator("[data-map-point-count]")
      await expect(pointCount.locator("output")).toHaveText("2")
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
            let firstColor = ""
            for (let index = 0; index < pixels.length; index += 4) {
              if (pixels[index + 3] === 0) continue
              const color = `${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`
              if (!firstColor) firstColor = color
              else if (color !== firstColor) return true
            }
            return false
          }, screenshot.toString("base64"))
        })
        .toBe(true)

      if (!isMobile) {
        const readMarkerPosition = async () => {
          const box = await groupMarker.boundingBox()
          if (!box) return null
          return {
            x: Math.round(box.x * 10) / 10,
            y: Math.round(box.y * 10) / 10,
          }
        }
        const markerPosition = await readMarkerPosition()
        const mapBox = await canvas.boundingBox()
        expect(markerPosition).not.toBeNull()
        expect(mapBox).not.toBeNull()
        if (!mapBox) throw new Error("Map canvas has no rendered bounds")

        await page.mouse.move(
          mapBox.x + mapBox.width * 0.55,
          mapBox.y + mapBox.height * 0.55
        )
        await page.mouse.down({ button: "right" })
        await page.mouse.move(
          mapBox.x + mapBox.width * 0.75,
          mapBox.y + mapBox.height * 0.3,
          { steps: 8 }
        )
        await page.mouse.up({ button: "right" })
        await canvas.focus()
        await page.keyboard.press("Shift+ArrowRight")
        await page.keyboard.press("Shift+ArrowUp")

        await expect.poll(readMarkerPosition).toEqual(markerPosition)
      }

      const readMapGeometry = () =>
        page.evaluate(() => {
          const header = document.querySelector("header")
          const workspace =
            document.querySelector<HTMLElement>("main#main-content")
          const mapRegion = document.querySelector<HTMLElement>(
            'section[aria-label="区域地图"]'
          )
          const discoveryRail = document.querySelector<HTMLElement>(
            'aside[aria-label="交换发现栏"]'
          )
          const mapContainer = document.querySelector<HTMLElement>(
            '[aria-label="区域事务所地图工作面"]'
          )
          const mapCanvas = document.querySelector<HTMLCanvasElement>(
            "canvas.maplibregl-canvas"
          )
          const mapTools = document.querySelector<HTMLElement>(
            ".exchange-web-search-dock"
          )
          if (
            !header ||
            !workspace ||
            !mapRegion ||
            !mapContainer ||
            !mapCanvas
          ) {
            return null
          }
          const headerRect = header.getBoundingClientRect()
          const workspaceRect = workspace.getBoundingClientRect()
          const mapRegionRect = mapRegion.getBoundingClientRect()
          const containerRect = mapContainer.getBoundingClientRect()
          const canvasRect = mapCanvas.getBoundingClientRect()
          return {
            headerBottom: headerRect.bottom,
            workspaceLeft: workspaceRect.left,
            workspaceRight: workspaceRect.right,
            workspaceTop: workspaceRect.top,
            workspaceBottom: workspaceRect.bottom,
            workspaceWidth: workspaceRect.width,
            workspaceHeight: workspaceRect.height,
            mapRegionLeft: mapRegionRect.left,
            mapRegionRight: mapRegionRect.right,
            mapRegionTop: mapRegionRect.top,
            mapRegionBottom: mapRegionRect.bottom,
            mapRegionWidth: mapRegionRect.width,
            mapRegionHeight: mapRegionRect.height,
            hasDiscoveryRail: Boolean(discoveryRail),
            containerLeft: containerRect.left,
            containerRight: containerRect.right,
            containerTop: containerRect.top,
            containerBottom: containerRect.bottom,
            containerWidth: containerRect.width,
            containerHeight: containerRect.height,
            canvasLeft: canvasRect.left,
            canvasRight: canvasRect.right,
            canvasTop: canvasRect.top,
            canvasBottom: canvasRect.bottom,
            canvasWidth: canvasRect.width,
            canvasHeight: canvasRect.height,
            mapToolsTop: mapTools?.getBoundingClientRect().top ?? null,
            mapToolsHeight: mapTools?.getBoundingClientRect().height ?? null,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight,
          }
        })

      const isSourceLayoutMap = (
        geometry: Awaited<ReturnType<typeof readMapGeometry>>,
        narrow: boolean
      ) => {
        if (geometry === null) return false
        const commonGeometryMatches =
          Math.abs(geometry.headerBottom - geometry.workspaceTop) <= 1 &&
          Math.abs(geometry.workspaceLeft) <= 1 &&
          Math.abs(geometry.workspaceRight - geometry.viewportWidth) <= 1 &&
          Math.abs(geometry.workspaceBottom - geometry.viewportHeight) <= 1 &&
          Math.abs(geometry.workspaceWidth - geometry.viewportWidth) <= 1 &&
          Math.abs(geometry.workspaceTop - geometry.mapRegionTop) <= 1 &&
          Math.abs(geometry.workspaceBottom - geometry.mapRegionBottom) <= 1 &&
          Math.abs(geometry.workspaceRight - geometry.mapRegionRight) <= 1 &&
          Math.abs(geometry.mapRegionLeft - geometry.containerLeft) <= 1 &&
          Math.abs(geometry.mapRegionRight - geometry.containerRight) <= 1 &&
          Math.abs(geometry.mapRegionTop - geometry.containerTop) <= 1 &&
          Math.abs(geometry.mapRegionBottom - geometry.containerBottom) <= 1 &&
          Math.abs(geometry.mapRegionWidth - geometry.containerWidth) <= 1 &&
          Math.abs(geometry.mapRegionHeight - geometry.containerHeight) <= 1 &&
          Math.abs(geometry.containerLeft - geometry.canvasLeft) <= 1 &&
          Math.abs(geometry.containerRight - geometry.canvasRight) <= 1 &&
          Math.abs(geometry.containerTop - geometry.canvasTop) <= 1 &&
          Math.abs(geometry.containerBottom - geometry.canvasBottom) <= 1 &&
          Math.abs(geometry.containerWidth - geometry.canvasWidth) <= 1 &&
          Math.abs(geometry.containerHeight - geometry.canvasHeight) <= 1 &&
          geometry.scrollWidth <= geometry.viewportWidth &&
          geometry.scrollHeight <= geometry.viewportHeight
        if (!commonGeometryMatches || geometry.hasDiscoveryRail) return false

        if (narrow) {
          return (
            Math.abs(geometry.mapRegionLeft) <= 1 &&
            geometry.headerBottom <= 49 &&
            geometry.mapToolsTop !== null &&
            geometry.mapToolsTop > geometry.workspaceTop &&
            geometry.mapToolsHeight !== null &&
            geometry.mapToolsHeight >= 44 &&
            geometry.mapToolsHeight <= 96 &&
            geometry.mapToolsTop + geometry.mapToolsHeight <=
              geometry.workspaceBottom
          )
        }

        return (
          Math.abs(geometry.mapRegionLeft - geometry.workspaceLeft) <= 1 &&
          geometry.mapToolsTop !== null &&
          geometry.mapToolsTop > geometry.workspaceTop &&
          geometry.mapToolsHeight !== null &&
          geometry.mapToolsHeight >= 44 &&
          geometry.mapToolsHeight <= 96
        )
      }

      await expect
        .poll(async () => isSourceLayoutMap(await readMapGeometry(), isMobile))
        .toBe(true)

      await page.setViewportSize(
        isMobile ? { width: 412, height: 780 } : { width: 1180, height: 760 }
      )
      await expect
        .poll(async () => isSourceLayoutMap(await readMapGeometry(), isMobile))
        .toBe(true)

      await groupMarker.click()
      const popup = page.getByRole("dialog", { name: "事务所详情" })
      await expect(popup).toHaveClass(/exchange-map-point-popup/)
      await expect(popup.getByText("上海活动交换事务所")).toBeVisible()
      await expect(
        popup.getByRole("link", { name: "查看事务所" }).first()
      ).toHaveAttribute("href", "/community/exchange/offices/shanghai-weekend")
      await expect(page.locator(".exchange-web-drawer")).toHaveAttribute(
        "data-open",
        "false"
      )

      const assertAnchored = async () => {
        await expect
          .poll(async () => {
            const marker = await groupMarker.boundingBox()
            const arrow = await popup
              .locator("[data-map-point-arrow]")
              .boundingBox()
            return marker && arrow
              ? Math.abs(
                  marker.x + marker.width / 2 - arrow.x - arrow.width / 2
                )
              : Infinity
          })
          .toBeLessThanOrEqual(2)
        expect(["top", "bottom"]).toContain(
          await popup.getAttribute("data-side")
        )
        const box = await popup.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(
          page.viewportSize()!.width
        )
        expect(box!.y + box!.height).toBeLessThanOrEqual(
          page.viewportSize()!.height
        )
      }
      await assertAnchored()
      const start = (await groupMarker.boundingBox())!
      await canvas.press("ArrowLeft")
      await expect
        .poll(async () => (await groupMarker.boundingBox())!.x - start.x)
        .toBeGreaterThan(40)
      await assertAnchored()
      await canvas.press("+")
      await assertAnchored()
      if (!isMobile) {
        const mapBox = (await canvas.boundingBox())!
        await page.mouse.move(
          mapBox.x + mapBox.width * 0.85,
          mapBox.y + mapBox.height * 0.7
        )
        await page.mouse.down()
        await page.mouse.move(
          mapBox.x + mapBox.width * 0.85 + 50,
          mapBox.y + mapBox.height * 0.7 - 20,
          { steps: 8 }
        )
        await page.mouse.up()
        await assertAnchored()
      }
      await expect(popup).toHaveCSS("opacity", "1")
      await expect(
        popup.getByRole("region", { name: "点位事务所资料" })
      ).toHaveAttribute("tabindex", "0")
      if (isMobile) {
        const reading = popup.getByRole("region", { name: "点位事务所资料" })
        await reading.press("End")
        await expect
          .poll(() => reading.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(0)
        await reading.press("Home")
      }
      expect(
        (
          await new AxeBuilder({ page })
            .include(".exchange-map-point-popup")
            .analyze()
        ).violations
      ).toEqual([])
      await page.screenshot({
        path: testInfo.outputPath("anchored-point-popup.png"),
      })

      await popup.getByRole("link", { name: "查看事务所" }).first().click()
      const fullDetails = page.locator(".exchange-map-page-dialog")
      await expect(fullDetails).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(fullDetails).toBeHidden()
      await expect(popup).toBeVisible()
      if (!isMobile) {
        await page.setViewportSize({ width: 900, height: 760 })
        await expect(popup.getByText("上海活动交换事务所")).toBeVisible()
        await page.setViewportSize({ width: 1180, height: 760 })
      }
      await popup.getByRole("button", { name: "关闭事务所详情" }).click()
      await expect(popup).toBeHidden()
      await expect(groupMarker).toBeFocused()
      await page.emulateMedia({ reducedMotion: "reduce" })
      await groupMarker.press("Enter")
      await expect(popup).toBeVisible()
      await expect(popup).toHaveCSS("transition-duration", "0s")
      await page.keyboard.press("Escape")
      await expect(popup).toBeHidden()
      await expect(groupMarker).toBeFocused()

      const mapRequestCount = requests.filter((url) =>
        url.includes("/api/community/exchange/map/offices?")
      ).length
      await page.getByRole("button", { name: "更多地图工具" }).click()
      await page.getByRole("menuitem", { name: "打开筛选" }).click()
      await page.getByRole("checkbox", { name: "仅看开放事务所" }).click()
      await expect(page).toHaveURL(/open=true/)
      await expect
        .poll(() =>
          requests
            .filter((url) =>
              url.includes("/api/community/exchange/map/offices?")
            )
            .some((url) => new URL(url).searchParams.get("open") === "true")
        )
        .toBe(true)
      expect(
        requests.filter((url) =>
          url.includes("/api/community/exchange/map/offices?")
        ).length
      ).toBeGreaterThan(mapRequestCount)
      for (const url of requests.filter((url) =>
        url.includes("/api/community/exchange/map/offices?")
      )) {
        expect(new URL(url).searchParams.get("bbox")).toBeTruthy()
        expect(new URL(url).searchParams.get("limit")).toBe("200")
      }

      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: "更多地图工具" }).click()
      await page
        .getByRole("menuitem", {
          name: "打开事务所名录",
          exact: true,
        })
        .click()
      const directory = page.getByRole("dialog", { name: "公开交换名录" })
      await expect(
        directory.getByRole("link", { name: "上海周末交换事务所" })
      ).toBeVisible()
      await page.getByRole("tab", { name: "名片" }).click()
      await expect(page.getByText("周末交换会名片")).toBeVisible()

      const accessibility = await new AxeBuilder({ page }).analyze()
      expect(accessibility.violations).toEqual([])
      expect(externalRequests).toEqual([])
      expect(controlledWarnings).toEqual([])
      expect(consoleErrors).toEqual([])

      if (process.env.CAPTURE_FUDABA_QA === "1") {
        await directory.getByRole("button", { name: "关闭" }).click()
        await expect(directory).toBeHidden()
        await page.screenshot({
          path: `/tmp/imsweb-fudaba-map-${testInfo.project.name}.png`,
        })
      }
    }
  )

  test(
    "falls back to the directory without hiding cards when config fails",
    {
      tag: "@firefox",
    },
    async ({ page, isMobile }) => {
      await api.mockRoute(
        "**/api/community/exchange/map/config",
        async (route) => {
          await route.fulfill({ status: 503, json: { error: "map disabled" } })
        },
        "GET"
      )
      await page.goto("/community/exchange?view=map")

      await expect(page.getByText("地图暂时不可用")).toBeVisible()
      const fallbackGeometry = await page.evaluate(() => {
        const header = document.querySelector("header")
        const workspace = document.querySelector("main")
        if (!header || !workspace) return null
        const headerRect = header.getBoundingClientRect()
        const workspaceRect = workspace.getBoundingClientRect()
        return {
          headerBottom: headerRect.bottom,
          workspaceLeft: workspaceRect.left,
          workspaceRight: workspaceRect.right,
          workspaceTop: workspaceRect.top,
          workspaceBottom: workspaceRect.bottom,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          footerPresent: Boolean(document.querySelector("footer")),
        }
      })
      expect(fallbackGeometry).not.toBeNull()
      expect(
        Math.abs(
          fallbackGeometry!.headerBottom - fallbackGeometry!.workspaceTop
        )
      ).toBeLessThanOrEqual(1)
      expect(Math.abs(fallbackGeometry!.workspaceLeft)).toBeLessThanOrEqual(1)
      expect(
        Math.abs(
          fallbackGeometry!.workspaceRight - fallbackGeometry!.viewportWidth
        )
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(
          fallbackGeometry!.workspaceBottom - fallbackGeometry!.viewportHeight
        )
      ).toBeLessThanOrEqual(1)
      expect(fallbackGeometry!.scrollWidth).toBeLessThanOrEqual(
        fallbackGeometry!.viewportWidth
      )
      expect(fallbackGeometry!.scrollHeight).toBeLessThanOrEqual(
        fallbackGeometry!.viewportHeight
      )
      expect(fallbackGeometry!.footerPresent).toBe(false)
      await page.getByRole("button", { name: "查看事务所名录" }).click()
      await expect(page).not.toHaveURL(/view=map/)
      const fallbackDirectory = page.getByRole("dialog", {
        name: "公开交换名录",
      })
      await expect(
        fallbackDirectory.getByRole("link", { name: "上海周末交换事务所" })
      ).toBeVisible()
      if (isMobile) {
        await page.evaluate(() => {
          document.documentElement.style.setProperty(
            "--safe-area-bottom",
            "34px"
          )
        })
        await expect
          .poll(() =>
            fallbackDirectory.evaluate((element) =>
              Math.abs(
                element.getBoundingClientRect().bottom - window.innerHeight
              )
            )
          )
          .toBeLessThanOrEqual(1)
        const safeAreaHeight = await fallbackDirectory.evaluate((element) => {
          const safeArea = element.querySelector(
            '[data-slot="sheet-bottom-safe-area"]'
          )
          return safeArea instanceof HTMLElement
            ? safeArea.getBoundingClientRect().height
            : null
        })
        expect(safeAreaHeight).toBe(34)
        if (process.env.CAPTURE_FUDABA_QA === "1") {
          await page.screenshot({
            path: "/tmp/imsweb-fudaba-directory-safe-area-mobile.png",
          })
        }
      }
      await fallbackDirectory.getByRole("tab", { name: "名片" }).click()
      await expect(fallbackDirectory.getByText("周末交换会名片")).toBeVisible()
      await fallbackDirectory
        .getByRole("button", { name: "查看周末交换会名片正面" })
        .click()
      await expect(page.getByRole("dialog")).toBeVisible()
      await page.keyboard.press("Escape")
      await fallbackDirectory.getByRole("tab", { name: "事务所" }).click()
      await fallbackDirectory
        .getByRole("link", { name: "上海周末交换事务所" })
        .click()
      await expect(page).toHaveURL(
        /\/community\/exchange\/offices\/shanghai-weekend$/
      )
      await expect(
        page.getByRole("heading", { name: "上海周末交换事务所" })
      ).toBeVisible()
    }
  )
})
