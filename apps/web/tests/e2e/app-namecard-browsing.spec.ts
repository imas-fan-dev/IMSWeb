import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "./fixtures/test"

import {
  applyNamecardSafeArea,
  attachNamecardScreenshot,
  expectNamecardNoOverflow,
  expectNamecardGalleryGeometry,
  expectNamecardPaginationGeometry,
  expectNamecardPaginationHitTargets,
  expectNamecardPreviewGeometry,
  expectNamecardReactionGraphics,
  expectNamecardReactionDensity,
  mockNamecardBrowsing,
} from "./fixtures/namecard-browsing"

test("preserves App safe areas, complete images and the list return position", async ({
  page,
  api,
}, testInfo) => {
  await mockNamecardBrowsing(page, api, 26, undefined, {
    cards: 3,
    reactionReads: 24,
    reactionWrites: 0,
  })
  await page.goto("/community/cards?page=1&size=12")
  await expect(page.locator("html")).toHaveAttribute("data-app-target", "app")
  await applyNamecardSafeArea(page)
  await expect(
    page.getByRole("heading", { name: "制作人名片墙" })
  ).toBeVisible()
  await expectNamecardGalleryGeometry(page)
  await expectNamecardReactionDensity(page)
  await attachNamecardScreenshot(page, testInfo, "app-gallery")
  const original = page.getByRole("button", { name: "查看制作人名片 12 正面" })
  await original.scrollIntoViewIfNeeded()
  const scrollY = await page.evaluate(() => window.scrollY)
  await original.click()
  const dialog = page.getByRole("dialog")
  await expectNamecardPreviewGeometry(page)
  await dialog.getByRole("button", { name: "背面", exact: true }).click()
  await expect(
    dialog.getByRole("img", { name: "制作人名片 12 背面" })
  ).toBeVisible()
  await attachNamecardScreenshot(page, testInfo, "app-preview-back")
  await dialog.getByRole("button", { name: "下一张名片" }).click()
  await expect(
    dialog.getByRole("img", { name: "制作人名片 13 正面" })
  ).toBeVisible()
  await expectNamecardPreviewGeometry(page)
  const accessibility = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze()
  expect(accessibility.violations).toEqual([])
  await dialog.getByRole("button", { name: "关闭名片预览" }).click()
  await expect(original).toBeFocused()
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeCloseTo(scrollY, 0)
  await expect(page).toHaveURL(/page=1&size=12$/)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
  await expect(page.getByRole("button", { name: "上传名片" })).toBeVisible()
  await page.evaluate(() => document.documentElement.classList.add("dark"))
  await attachNamecardScreenshot(page, testInfo, "app-gallery-dark")
  await expectNamecardPaginationGeometry(page)
  await expectNamecardPaginationHitTargets(page)
  await attachNamecardScreenshot(page, testInfo, "app-pagination")
  await page.getByRole("button", { name: "下一页", exact: true }).click()
  await expect(page).toHaveURL(/page=2&size=12$/)
  await expect(
    page.getByRole("button", { name: "查看制作人名片 13 正面" })
  ).toBeVisible()
  await expectNamecardNoOverflow(page)
})

test("yields floating actions to pagination and renders bundled reaction graphics", async ({
  page,
  api,
}, testInfo) => {
  await mockNamecardBrowsing(page, api, 26, undefined, {
    cards: 2,
    reactionReads: 36,
    reactionWrites: 1,
  })
  await page.goto("/community/cards?page=2&size=12")
  await applyNamecardSafeArea(page)
  const first = page.locator("[data-namecard-item]").first()
  await expect(first.locator("time")).toHaveText("09-01 16:00")
  await expect(first.locator("time")).toHaveAttribute(
    "datetime",
    "2026-09-01T08:00:00.000Z"
  )
  await expect(first.locator("time")).toHaveAttribute(
    "title",
    "提交于 2026年9月1日 16:00:00（北京时间）"
  )
  await first.getByRole("button", { name: "添加反应" }).click()
  await expectNamecardReactionGraphics(page)
  await attachNamecardScreenshot(page, testInfo, "app-uniform-reactions")
  await page
    .getByRole("button", { name: /，添加反应$/ })
    .last()
    .click()
  await expect(first.getByRole("button", { name: "🔘，1 次反应" })).toHaveText(
    "1"
  )

  await expectNamecardPaginationGeometry(page)
  const pagination = page.getByRole("navigation", { name: "名片分页" })
  await pagination.getByRole("spinbutton", { name: "跳至" }).fill("3")
  await expectNamecardPaginationHitTargets(page)
  await pagination.getByRole("combobox", { name: "每页显示" }).click()
  await page.getByRole("option", { name: "24 张" }).click()
  await expect(page).toHaveURL(/page=1&size=24$/)
  await expect(first).toBeVisible()
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
  await expect(page.locator("[data-app-floating-actions]")).toBeVisible()
  await expect(page.getByRole("button", { name: "上传名片" })).toBeVisible()
})
