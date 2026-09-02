import { expect, test } from "@playwright/test"

const emptyPage = {
  items: [],
  pageInfo: { hasNextPage: false, nextCursor: null },
}

async function installMapMocks(page: import("@playwright/test").Page) {
  await page.route("**/api/community/exchange/series", async (route) => {
    await route.fulfill({ json: { items: [] } })
  })
  await page.route("**/api/community/exchange/offices?*", async (route) => {
    await route.fulfill({ json: emptyPage })
  })
  await page.route("**/api/community/exchange/cards?*", async (route) => {
    await route.fulfill({ json: emptyPage })
  })
  await page.route("**/api/community/exchange/map/config", async (route) => {
    await route.fulfill({
      json: { styleUrl: "/maps/exchange-test-style.json" },
    })
  })
  await page.route("**/api/community/exchange/map/offices?*", async (route) => {
    await route.fulfill({ json: { items: [], truncated: false } })
  })
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
  await installMapMocks(page)
})

test("uses browser geolocation to return to the current position", async ({
  context,
  page,
}) => {
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
        canvasBox.x + canvasBox.width / 2 - (markerBox.x + markerBox.width / 2)
      )
      const verticalDistance = Math.abs(
        canvasBox.y +
          canvasBox.height / 2 -
          (markerBox.y + markerBox.height / 2)
      )
      return horizontalDistance < 2 && verticalDistance < 2
    })
    .toBe(true)
})

test("renders the exchange map behind non-overlapping local and global controls", async ({
  page,
}, testInfo) => {
  await page.goto("/community/exchange")
  await applySafeArea(page)

  const canvas = page.locator("canvas.maplibregl-canvas")
  await expect(canvas).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("banner")).toHaveCount(0)

  const globalNavigation = page.getByRole("navigation", { name: "主导航" })
  await expect(
    globalNavigation.getByRole("link", { name: "地图" })
  ).toHaveAttribute("aria-current", "page")

  const toolTrigger = page.locator('button[aria-controls="exchange-map-tools"]')
  await expect(toolTrigger).toHaveAccessibleName("展开地图工具")
  await expect(toolTrigger).toBeVisible()
  await toolTrigger.click()
  await expect(toolTrigger).toHaveAccessibleName("收起地图工具")
  const toolbar = page.getByRole("toolbar", { name: "交换地图工具" })
  await expect(toolbar).toBeVisible()
  await expect(toolbar.getByRole("button", { name: "打开筛选" })).toBeVisible()
  await expect(
    toolbar.getByRole("button", { name: "打开事务所名录" })
  ).toBeVisible()
  await expect(
    toolbar.getByRole("button", { name: "打开名片名录" })
  ).toBeVisible()

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
})
