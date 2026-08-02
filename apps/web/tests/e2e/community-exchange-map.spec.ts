import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

const series = {
  items: [
    {
      code: "765as",
      displayName: "本家 / 765AS",
      displayOrder: 0,
      activeOfficeCount: 2,
    },
    {
      code: "cinderella",
      displayName: "灰姑娘女孩",
      displayOrder: 1,
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
  accent: "#f34e6c",
  coverUrl: null,
  isOpen: true,
  visitorCount: 21,
  seriesCodes: ["765as"],
}

const mapOffices = [
  {
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
  },
  {
    id: "office-2",
    slug: "shanghai-event",
    name: "上海活动交换事务所",
    city: "上海",
    accent: "#2581c7",
    isOpen: false,
    seriesCodes: ["cinderella"],
    location: {
      latitude: 31.2,
      longitude: 121.5,
      precision: "regional",
    },
  },
]

const card = {
  id: "card-1",
  producerName: "春香P",
  displayName: "周末交换会名片",
  seriesCode: "765as",
  favoriteIdol: "天海春香",
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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
  })
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (
      ["http:", "https:"].includes(url.protocol) &&
      !["127.0.0.1", "localhost"].includes(url.hostname)
    ) {
      await route.abort("blockedbyclient")
      return
    }
    await route.continue()
  })
  await page.route("**/api/community/exchange/series", async (route) => {
    await route.fulfill({ json: series })
  })
  await page.route("**/api/community/exchange/offices?*", async (route) => {
    await route.fulfill({
      json: {
        items: [directoryOffice],
        pageInfo: { hasNextPage: false, nextCursor: null },
      },
    })
  })
  await page.route("**/api/community/exchange/cards?*", async (route) => {
    await route.fulfill({
      json: {
        items: [card],
        pageInfo: { hasNextPage: false, nextCursor: null },
      },
    })
  })
  await page.route(
    "**/api/community/exchange/offices/shanghai-weekend",
    async (route) => {
      await route.fulfill({
        json: { office: { ...directoryOffice, cards: [] } },
      })
    }
  )
  await page.route("**/api/community/exchange/map/config", async (route) => {
    await route.fulfill({
      json: { styleUrl: "/api/community/exchange/map/style.json" },
    })
  })
  await page.route(
    "**/api/community/exchange/map/style.json",
    async (route) => {
      await route.fulfill({
        json: {
          version: 8,
          name: "IMSWeb regional map test style",
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#f4f4f5" },
            },
          ],
        },
      })
    }
  )
})

test("loads the regional map on demand and keeps an accessible office path", async ({
  page,
  isMobile,
}, testInfo) => {
  const requests: string[] = []
  const externalRequests: string[] = []
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
  await page.route("**/api/community/exchange/map/offices?*", async (route) => {
    await route.fulfill({ json: { items: mapOffices, truncated: false } })
  })

  await page.goto("/community/exchange?bbox=100,20,130,45")
  await expect(page.getByText("周末交换会名片")).toBeVisible()
  await expect(page).not.toHaveURL(/bbox=/)
  expect(requests.some((url) => url.includes("maplibre"))).toBe(false)
  expect(requests.some((url) => url.includes("/exchange/map/config"))).toBe(
    false
  )

  await page.getByRole("tab", { name: "地图" }).click()
  await expect(page).toHaveURL(/view=map/)
  await expect(page).not.toHaveURL(/bbox=/)

  const canvas = page.locator("canvas.maplibregl-canvas")
  await expect(canvas).toBeVisible()
  await expect
    .poll(() => requests.some((url) => url.includes("maplibre-gl-worker")))
    .toBe(true)

  const groupMarker = page
    .getByLabel("区域事务所地图工作面", { exact: true })
    .getByRole("button", {
      name: /上海周末交换事务所、上海活动交换事务所，2 个事务所/,
    })
  await expect(groupMarker).toBeVisible()
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

  await page
    .getByLabel("区域事务所地图工作面", { exact: true })
    .evaluate((element) => {
      document.documentElement.style.scrollBehavior = "auto"
      const top = element.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: Math.max(0, top - 80) })
    })
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0)
  await groupMarker.click()

  if (isMobile) {
    await expect(
      page.getByRole("dialog").getByText("上海活动交换事务所")
    ).toBeVisible()
  } else {
    await expect(page.getByText("上海活动交换事务所")).toBeVisible()
  }
  await expect(
    page.getByRole("link", { name: "查看事务所" }).first()
  ).toHaveAttribute("href", "/community/exchange/offices/shanghai-weekend")
  if (isMobile) await page.keyboard.press("Escape")

  const mapRequestCount = requests.filter((url) =>
    url.includes("/api/community/exchange/map/offices?")
  ).length
  await page.getByRole("checkbox", { name: "仅看开放事务所" }).click()
  await expect(page).toHaveURL(/view=map/)
  await expect(page).toHaveURL(/open=true/)
  await expect
    .poll(
      () =>
        requests.filter((url) =>
          url.includes("/api/community/exchange/map/offices?")
        ).length
    )
    .toBeGreaterThan(mapRequestCount)
  expect(
    requests
      .filter((url) => url.includes("/api/community/exchange/map/offices?"))
      .some((url) => new URL(url).searchParams.get("open") === "true")
  ).toBe(true)
  for (const url of requests.filter((url) =>
    url.includes("/api/community/exchange/map/offices?")
  )) {
    expect(new URL(url).searchParams.get("bbox")).toBeTruthy()
    expect(new URL(url).searchParams.get("limit")).toBe("200")
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => window.innerWidth)
  )
  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations).toEqual([])
  expect(externalRequests).toEqual([])
  await expect(page.getByText("周末交换会名片")).toBeVisible()

  if (process.env.CAPTURE_FUDABA_QA === "1") {
    await page.screenshot({
      path: `/tmp/imsweb-fudaba-map-${testInfo.project.name}.png`,
      fullPage: true,
    })
  }
})

test("falls back to the directory without hiding cards when config fails", async ({
  page,
}) => {
  await page.route("**/api/community/exchange/map/config", async (route) => {
    await route.fulfill({ status: 503, json: { error: "map disabled" } })
  })
  await page.goto("/community/exchange?view=map")

  await expect(page.getByText("地图暂时不可用")).toBeVisible()
  await expect(page.getByText("周末交换会名片")).toBeVisible()
  await page.getByRole("button", { name: "查看事务所名录" }).click()
  await expect(page).not.toHaveURL(/view=map/)
  await expect(page.getByText("上海周末交换事务所")).toBeVisible()
  await page.getByRole("button", { name: "查看周末交换会名片正面" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
  await page.getByRole("link", { name: "上海周末交换事务所" }).click()
  await expect(page).toHaveURL(
    /\/community\/exchange\/offices\/shanghai-weekend$/
  )
  await expect(
    page.getByRole("heading", { name: "上海周末交换事务所" })
  ).toBeVisible()
})
