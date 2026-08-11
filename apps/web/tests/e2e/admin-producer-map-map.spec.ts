import { expect, test } from "@playwright/test"

const guangdongImageUrl = "/uploads/producer-map/guangdong.webp"

const content = {
  version: 1,
  title: "全国偶像大师社群一览",
  subtitle: "THE IDOLM@STER COMMUNITY MAP",
  introduction: "连接各地制作人社群。",
  directoryTitle: "制作人社群名录",
  mapSourceLabel: "地图数据源",
  mapSourceUrl: "https://example.test/china-map",
  regions: [
    {
      id: "region-guangdong",
      province: "广东省",
      name: "广东制作人社群",
      summary: "珠三角及周边地区制作人交流。",
      contact: "QQ 123456",
      linkUrl: "https://example.test/guangdong",
      imageUrl: guangdongImageUrl,
      series: "all",
      enabled: true,
    },
  ],
  communities: [
    {
      id: "community-guangdong",
      name: "广东制作人交流群",
      platform: "QQ",
      region: "广东省",
      description: "广东地区制作人日常交流。",
      contact: "群号 654321",
      linkUrl: null,
      imageUrl: null,
      series: "all",
      enabled: true,
    },
  ],
  updatedAt: "2026-08-11T01:00:00.000Z",
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/check", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        user: {
          id: 1,
          username: "producer-map-operator",
          producername: "地图运营",
          dept: "op",
          adminRole: "admin",
        },
      }),
    })
  })
  await page.route("**/api/admin/producer-map", async (route) => {
    if (route.request().method() !== "GET") {
      await route.abort()
      return
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        content,
        revision: '"producer-map-e2e-1"',
      }),
    })
  })
  await page.route(`**${guangdongImageUrl}`, async (route) => {
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64"
      ),
    })
  })
})

test("admin edits configured and unconfigured provinces from the real map", async ({
  page,
}) => {
  await page.goto("/admin/producer-map")

  await expect(
    page.getByRole("heading", { name: "制作人地图配置" })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "地图编辑" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )

  const map = page.getByRole("img", {
    name: "中国省级行政区地点配置地图",
  })
  const canvas = map.locator("canvas")
  await expect(canvas).toBeVisible()

  const canvasBox = await canvas.boundingBox()
  expect(canvasBox).not.toBeNull()
  expect(canvasBox!.width).toBeGreaterThan(200)
  expect(canvasBox!.height).toBeGreaterThan(200)
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement)) return false
        const context = element.getContext("2d")
        if (!context || element.width === 0 || element.height === 0)
          return false

        const pixels = context.getImageData(
          0,
          0,
          element.width,
          element.height
        ).data
        for (let offset = 3; offset < pixels.length; offset += 64) {
          if (pixels[offset] !== 0) return true
        }
        return false
      })
    )
    .toBe(true)

  const provinceSelect = page.getByRole("combobox", { name: "行政区" })
  await expect(provinceSelect).toContainText("广东省")
  await canvas.click({
    position: {
      x: canvasBox!.width * 0.62,
      y: canvasBox!.height * 0.74,
    },
  })
  let dialog = page.getByRole("dialog", { name: "编辑地图地点" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel("行政区")).toHaveValue("广东省")
  await dialog.getByRole("button", { name: "取消" }).click()
  await expect(provinceSelect).toBeFocused()

  const editRegionButton = page.getByRole("button", { name: "编辑地点" })
  await editRegionButton.click()

  dialog = page.getByRole("dialog", { name: "编辑地图地点" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel("行政区")).toHaveValue("广东省")
  await expect(dialog.getByLabel("行政区")).toHaveAttribute("readonly")
  await expect(
    dialog.getByText(guangdongImageUrl, { exact: true })
  ).toHaveCount(0)
  const rawImageUrlControlCount = await dialog
    .locator("input, textarea")
    .evaluateAll(
      (controls, imageUrl) =>
        controls.filter(
          (control) =>
            (control as HTMLInputElement | HTMLTextAreaElement).value ===
            imageUrl
        ).length,
      guangdongImageUrl
    )
  expect(rawImageUrlControlCount).toBe(0)
  await dialog.getByRole("button", { name: "取消" }).click()
  await expect(editRegionButton).toBeFocused()

  await provinceSelect.focus()
  await expect(provinceSelect).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("listbox")).toBeVisible()
  await page.keyboard.press("Home")
  await page.keyboard.press("Enter")
  await expect(provinceSelect).toContainText("北京市")

  await page.getByRole("button", { name: "新增地点" }).click()
  dialog = page.getByRole("dialog", { name: "新增地图地点" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel("行政区")).toHaveValue("北京市")
  await expect(dialog.getByLabel("行政区")).toHaveAttribute("readonly")
  await dialog.getByRole("button", { name: "取消" }).click()

  await page.getByRole("button", { name: "公开顺序" }).click()
  await expect(
    page.getByRole("button", { name: "拖动排序：广东制作人社群" })
  ).toBeVisible()
  await expect(page.getByText(guangdongImageUrl, { exact: true })).toHaveCount(
    0
  )

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  )
  expect(hasHorizontalOverflow).toBe(false)
})
