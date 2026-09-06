import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

import {
  applyNamecardSafeArea,
  attachNamecardScreenshot,
  expectNamecardNoOverflow,
  expectNamecardGalleryGeometry,
  expectNamecardPaginationGeometry,
  expectNamecardPreviewGeometry,
  expectNamecardReactionGraphics,
  expectNamecardReactionDensity,
  mockNamecardBrowsing,
} from "./fixtures/namecard-browsing"

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`keeps complete faces and preview controls inside ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    await mockNamecardBrowsing(page)
    await page.goto("/community/cards?page=1&size=12")
    await applyNamecardSafeArea(page)
    const front = page.getByRole("button", { name: "查看制作人名片 1 正面" })
    await expect(front).toBeVisible()
    const back = page.getByRole("button", { name: "查看制作人名片 1 背面" })
    await expect(back).toBeVisible()
    await expectNamecardGalleryGeometry(page)
    await attachNamecardScreenshot(page, testInfo, "gallery-dual-face")
    await back.click()
    await expect(
      page.getByRole("img", { name: "制作人名片 1 背面" })
    ).toHaveAttribute("src", "/__namecard-qa/back-1.png")
    await expectNamecardPreviewGeometry(page)
    await attachNamecardScreenshot(page, testInfo, "preview")
    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze()
    expect(results.violations).toEqual([])
    await page.getByRole("button", { name: "关闭名片预览" }).click()
    await expectNamecardNoOverflow(page)
    await page.getByRole("button", { name: "添加反应" }).first().click()
    const pickerButtons = page.getByRole("button", { name: /，添加反应$/ })
    await expect(pickerButtons).toHaveCount(46)
    await expectNamecardReactionGraphics(page)
    await page
      .locator('[data-slot="popover-content"]')
      .evaluate(async (element) => {
        await Promise.allSettled(
          element
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished)
        )
      })
    await expect(page.locator('[data-slot="popover-content"]')).toHaveCSS(
      "opacity",
      "1"
    )
    await expect
      .poll(async () => (await pickerButtons.first().boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(43.5)
    for (const button of await pickerButtons.all()) {
      const box = await button.boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(43.5)
      expect(box?.height).toBeGreaterThanOrEqual(43.5)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
    }
    await pickerButtons.last().click()
    const card = page.locator('[data-slot="card"]').filter({ has: front })
    await expect(
      card.getByRole("button", { name: "🔘，1 次反应", exact: true })
    ).toContainText("1")
    await page
      .getByRole("button", { name: "下一页", exact: true })
      .scrollIntoViewIfNeeded()
    await expectNamecardPaginationGeometry(page)
  })
}

test("packs columns by content height and reflows after delayed reactions and resizing", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await mockNamecardBrowsing(page, 26, {
    1: { "👍": 2, "🎮": 4, "🌹": 3, "🍔": 5, "🍭": 6, "🔨": 7 },
  })
  const release = api.holdReactions(1)
  try {
    await page.goto("/community/cards?page=1&size=12")
    await expectNamecardGalleryGeometry(page)
    const cards = page.locator("[data-namecard-item]")
    const before = await cards.evaluateAll((elements) =>
      elements.slice(0, 4).map((element) => element.getBoundingClientRect().y)
    )
    expect(before[2]).toBeCloseTo(before[3]!, 0)
    release()
    await expect(
      cards.first().getByRole("button", { name: "🎮，4 次反应", exact: true })
    ).toBeVisible()
    await expectNamecardGalleryGeometry(page)
    const after = await cards.evaluateAll((elements) =>
      elements.slice(0, 4).map((element) => element.getBoundingClientRect().y)
    )
    expect(after[0]).toBeCloseTo(after[1]!, 0)
    expect(after[2]! - before[2]!).toBeGreaterThan(43)
    expect(after[3]).toBeCloseTo(before[3]!, 0)
    await expect(
      page.getByRole("button", { name: /查看制作人名片 \d+ 正面/ })
    ).toHaveCount(12)
    const order = await page
      .getByRole("button", { name: /查看制作人名片 \d+ 正面/ })
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute("aria-label"))
      )
    expect(order).toEqual(
      Array.from(
        { length: 12 },
        (_, index) => `查看制作人名片 ${index + 1} 正面`
      )
    )
    await attachNamecardScreenshot(page, testInfo, "natural-columns-grown")
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      await expectNamecardGalleryGeometry(page)
    }
  } finally {
    release()
  }
})

test("keeps mobile reactions compact with at most four entries per row", async ({
  page,
}, testInfo) => {
  await mockNamecardBrowsing(page, 26, {
    1: { "❤️": 21, "👍": 13, "🥰": 13, "😍": 11, "✨": 10, "🎮": 6 },
  })
  await page.setViewportSize({ width: 402, height: 874 })
  await page.goto("/community/cards?page=1&size=12")
  const first = page.locator("[data-namecard-item]").first()
  await expect(
    first.getByRole("button", { name: "🎮，6 次反应", exact: true })
  ).toBeVisible()
  await expectNamecardReactionDensity(page)
  const rows = await first
    .locator('[aria-label="名片反应"] button')
    .evaluateAll((buttons) => {
      const counts = new Map<number, number>()
      for (const button of buttons) {
        const y = Math.round(button.getBoundingClientRect().y)
        counts.set(y, (counts.get(y) ?? 0) + 1)
      }
      return Array.from(counts.values())
    })
  expect(rows).toEqual([4, 3])
  await attachNamecardScreenshot(page, testInfo, "compact-reactions-402")
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    await expectNamecardReactionDensity(page)
    await expectNamecardGalleryGeometry(page)
  }
  const accessibility = await new AxeBuilder({ page })
    .include("[data-namecard-item]")
    .analyze()
  expect(accessibility.violations).toEqual([])
})

test("keeps all 48 reaction-heavy cards separated without overflowing grid capacity", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  const counts = Object.fromEntries(
    ["👍", "❤️", "😂", "🤣", "😭", "😍", "🥰", "😘", "🤯", "😱", "😎"].map(
      (emoji) => [emoji, 999999]
    )
  )
  await mockNamecardBrowsing(
    page,
    48,
    Object.fromEntries(
      Array.from({ length: 48 }, (_, index) => [index + 1, counts])
    )
  )
  await page.goto("/community/cards?page=1&size=48")
  const cards = page.locator("[data-namecard-item]")
  await expect(cards).toHaveCount(48)
  await expect(
    cards.last().getByRole("button", { name: "😎，999999 次反应", exact: true })
  ).toBeAttached()
  await expect
    .poll(() =>
      cards.evaluateAll((elements) => {
        const boxes = elements.map((element) => element.getBoundingClientRect())
        return boxes.every((box, index) => {
          if (index < 2) return true
          const gap = box.top - boxes[index - 2]!.bottom
          return gap >= 11.5 && gap <= 13.5
        })
      })
    )
    .toBe(true)
  await expectNamecardReactionDensity(page)
  const tracks = await page
    .locator("[data-namecard-gallery]")
    .evaluate(
      (gallery) => getComputedStyle(gallery).gridTemplateRows.split(" ").length
    )
  expect(tracks).toBeLessThanOrEqual(95)
  const bottom = await cards.evaluateAll((elements) =>
    Math.max(
      ...elements.map((element) => element.getBoundingClientRect().bottom)
    )
  )
  const pagination = await page
    .getByRole("button", { name: "上一页", exact: true })
    .boundingBox()
  expect(bottom).toBeLessThanOrEqual(pagination!.y)
  await expectNamecardNoOverflow(page)
})

test("uses compact pagination with keyboard draft controls and reveals the next page", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockNamecardBrowsing(page)
  await page.goto("/community/cards?page=1&size=12")
  await expectNamecardPaginationGeometry(page)
  await attachNamecardScreenshot(page, testInfo, "compact-pagination")
  await page.getByRole("button", { name: "下一页", exact: true }).click()
  await expect(page).toHaveURL(/page=2&size=12$/)
  await expect(
    page.getByRole("button", { name: "查看制作人名片 13 正面" })
  ).toBeInViewport()
  await expectNamecardPaginationGeometry(page)
  const input = page.getByRole("spinbutton", { name: "跳至" })
  await input.fill("3")
  await input.press("Escape")
  await expect(input).toHaveValue("2")
  await expect(
    page.getByRole("button", { name: "跳转", exact: true })
  ).toBeDisabled()
  await input.fill("3")
  await input.press("Enter")
  await expect(page).toHaveURL(/page=3&size=12$/)
  await expect(
    page.getByRole("button", { name: "查看制作人名片 25 正面" })
  ).toBeInViewport()
  await expect(
    page.getByRole("button", { name: "下一页", exact: true })
  ).toBeDisabled()
  await page.getByRole("combobox", { name: "每页显示" }).click()
  await page.getByRole("option", { name: "48 张", exact: true }).click()
  await expect(page).toHaveURL(/page=1&size=48$/)
  await expect(
    page.getByRole("button", { name: "查看制作人名片 1 正面" })
  ).toBeInViewport()
  await expect(page.getByRole("spinbutton", { name: "跳至" })).toHaveValue("1")
  await expectNamecardNoOverflow(page)
})

test("reads across page boundaries and returns to the original list face and position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await mockNamecardBrowsing(page)
  await page.goto("/community/cards?page=1&size=12")
  const original = page.getByRole("button", { name: "查看制作人名片 12 背面" })
  await original.scrollIntoViewIfNeeded()
  const scrollY = await page.evaluate(() => window.scrollY)
  await original.click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "放大名片" }).click()
  await dialog.getByRole("button", { name: "下一张名片" }).click()
  await expect(
    dialog.getByRole("img", { name: "制作人名片 13 正面" })
  ).toBeVisible()
  await expect(dialog.getByRole("img")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)"
  )
  await expect(page).toHaveURL(/page=1&size=12$/)
  await dialog.getByRole("button", { name: "下一张名片" }).click()
  await expect(
    dialog.getByRole("img", { name: "制作人名片 14 正面" })
  ).toBeVisible()
  expect(api.requests).toEqual([1, 2])
  await dialog.getByRole("button", { name: "上一张名片" }).click()
  await dialog.getByRole("button", { name: "上一张名片" }).click()
  await expect(
    dialog.getByRole("img", { name: "制作人名片 12 正面" })
  ).toBeVisible()
  await dialog.getByRole("button", { name: "关闭名片预览" }).click()
  await expect(dialog).toBeHidden()
  await expect(original).toBeFocused()
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeCloseTo(scrollY, 0)
  await expect(page).toHaveURL(/page=1&size=12$/)
})

test("keeps the current card on failure, retries, and ignores responses after closing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const api = await mockNamecardBrowsing(page)
  await page.goto("/community/cards?page=1&size=12")
  const original = page.getByRole("button", { name: "查看制作人名片 12 正面" })
  await original.click()
  const dialog = page.getByRole("dialog")
  api.failOnce(2)
  await dialog.getByRole("button", { name: "下一张名片" }).click()
  await expect(
    dialog.getByRole("img", { name: "制作人名片 12 正面" })
  ).toBeVisible()
  await dialog.getByRole("button", { name: "重试加载名片" }).click()
  await expect(
    dialog.getByRole("img", { name: "制作人名片 13 正面" })
  ).toBeVisible()
  await dialog.getByRole("button", { name: "关闭名片预览" }).click()
  await original.click()
  api.hold(2)
  await dialog.getByRole("button", { name: "下一张名片" }).click()
  await expect(
    dialog.getByRole("button", { name: "下一张名片" })
  ).toBeDisabled()
  await dialog.getByRole("button", { name: "关闭名片预览" }).click()
  await page.getByRole("button", { name: "查看制作人名片 1 正面" }).click()
  const response = page.waitForResponse(
    (result) => new URL(result.url()).searchParams.get("page") === "2"
  )
  api.release()
  await response
  await expect(
    dialog.getByRole("img", { name: "制作人名片 1 正面" })
  ).toBeVisible()
  await expect(
    dialog.getByRole("button", { name: "上一张名片" })
  ).toBeDisabled()
  await dialog.getByRole("button", { name: "关闭名片预览" }).click()
  await page.goto("/community/cards?page=3&size=12")
  await page.getByRole("button", { name: "查看制作人名片 26 正面" }).click()
  await expect(
    dialog.getByRole("button", { name: "下一张名片" })
  ).toBeDisabled()
})
