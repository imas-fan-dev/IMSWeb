import { expect, test } from "./fixtures/test"
import {
  exerciseUnifiedSearch,
  installUnifiedSearchApis,
} from "./fixtures/exchange-search"

test("searches offices first and places separately without rebuilding the map @mobile", async ({
  api,
  page,
}, info) => {
  const queries = await installUnifiedSearchApis(api)
  await exerciseUnifiedSearch(page, info, false)
  expect(queries).toContain("上海")
})

for (const width of [390, 1024, 1440]) {
  const desktop = width >= 1024
  test(`keeps office search and range panels ${desktop ? "independent" : "exclusive"} at ${width}px @mobile`, async ({
    api,
    page,
  }, info) => {
    await installUnifiedSearchApis(api)
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto("/community/exchange?view=map")
    await expect(page.locator("[data-map-results-state]")).toHaveAttribute(
      "data-map-results-state",
      "ready"
    )
    const input = page.getByRole("textbox", { name: "搜索事务所" })
    const drawer = page.locator(".exchange-web-drawer")
    const range = page.getByRole("button", { name: "范围内事务所列表" })
    const rangePanel = page.getByRole("region", { name: "当前范围事务所列表" })
    const result = page.getByRole("button", { name: /上海交换事务所/ })
    const canvas = await page
      .locator("canvas.maplibregl-canvas")
      .elementHandle()

    await input.fill("上海")
    await input.press("Enter")
    await expect(result).toBeVisible()
    await range.click()
    await expect(range).toHaveAttribute("aria-expanded", "true")
    await expect(drawer).toHaveAttribute("data-open", String(desktop))
    if (desktop) await expect(result).toBeVisible()
    else await expect(drawer).toHaveAttribute("inert", "")

    if (desktop) {
      await page.getByRole("button", { name: "收起地图面板" }).click()
      await expect(drawer).toHaveAttribute("data-open", "false")
      await expect(range).toHaveAttribute("aria-expanded", "true")
    }
    await page.getByRole("button", { name: "展开地图面板" }).click()
    await expect(drawer).toHaveAttribute("data-open", "true")
    await expect(result).toBeVisible()
    await expect(range).toHaveAttribute("aria-expanded", String(desktop))
    if (desktop) {
      await expect(rangePanel).toBeVisible()
      const searchBounds = await drawer.boundingBox()
      const rangeBounds = await rangePanel.boundingBox()
      expect(searchBounds!.x + searchBounds!.width).toBeLessThanOrEqual(
        rangeBounds!.x
      )
    } else await expect(rangePanel).toBeHidden()

    if (!desktop) await range.click()
    await input.fill("上海浦东")
    await input.press("Enter")
    await expect(drawer).toHaveAttribute("data-open", "true")
    await expect(range).toHaveAttribute("aria-expanded", String(desktop))
    await expect(input).toHaveValue("上海浦东")
    await expect(result).toBeVisible()
    expect(await canvas?.evaluate((node) => node.isConnected)).toBe(true)
    await page.screenshot({ path: info.outputPath("search-and-range.png") })
  })
}

test("animates the office panel in both directions and respects reduced motion @mobile", async ({
  api,
  page,
}, info) => {
  // This case opens no search or office detail routes.
  await installUnifiedSearchApis(api)
  await page.goto("/community/exchange?view=map")
  await expect(page.locator("[data-map-results-state]")).toHaveAttribute(
    "data-map-results-state",
    "ready"
  )
  const trigger = page.getByRole("button", { name: "范围内事务所列表" })
  await expect(trigger).toBeVisible()
  for (const open of [true, false]) {
    await trigger.click()
    const animations = await page
      .locator(".exchange-web-map-count")
      .evaluate(async (node) => {
        const running = node.getAnimations({ subtree: true })
        const count = running.length
        await Promise.all(running.map((a) => a.finished.catch(() => {})))
        return count
      })
    expect(animations).toBeGreaterThan(0)
    await expect(trigger).toHaveAttribute("aria-expanded", String(open))
    await page.screenshot({
      path: info.outputPath(
        open ? "office-panel-open.png" : "office-panel-closed.png"
      ),
    })
  }
  await page.emulateMedia({ reducedMotion: "reduce" })
  await trigger.click()
  expect(
    await page
      .locator(".exchange-web-map-count")
      .evaluate((node) => node.getAnimations({ subtree: true }).length)
  ).toBe(0)
})
