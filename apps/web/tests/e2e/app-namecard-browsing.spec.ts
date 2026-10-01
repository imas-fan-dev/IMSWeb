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

test.describe("app namecard browsing", () => {
  test("scrolls focused pagination clear of the fixed App navigation", async ({
    page,
    api,
  }) => {
    await mockNamecardBrowsing(page, api, 26, undefined, {
      cards: 1,
      reactionReads: 12,
      reactionWrites: 0,
    })
    await page.goto("/community/cards?page=2&size=12")
    await applyNamecardSafeArea(page)
    await expectNamecardPaginationGeometry(page)
    const pagination = page.getByRole("navigation", { name: "名片分页" })
    await pagination.getByRole("spinbutton", { name: "跳至" }).fill("3")
    // Reproduce a focus-restored position that is inside the viewport but
    // underneath the fixed navigation, where scrollIntoViewIfNeeded is a no-op.
    await pagination.evaluate((element) => {
      window.scrollBy({
        top: element.getBoundingClientRect().bottom - innerHeight + 1,
        behavior: "instant",
      })
    })
    await expect
      .poll(() =>
        pagination.evaluate((element) => {
          const input = element.querySelector("#namecard-target-page")!
          const box = input.getBoundingClientRect()
          const hit = document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2
          )
          return Boolean(hit?.closest('nav[aria-label="主导航"]'))
        })
      )
      .toBe(true)
    await expectNamecardPaginationHitTargets(page)
    await expect(
      pagination.getByRole("spinbutton", { name: "跳至" })
    ).toHaveValue("3")
  })

  test("preserves App safe areas, complete images and the list return position", async ({
    page,
    api,
  }, testInfo) => {
    await mockNamecardBrowsing(page, api, 26, undefined, {
      cards: 2,
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
    const original = page.getByRole("button", {
      name: "查看制作人名片 12 正面",
    })
    await original.scrollIntoViewIfNeeded()
    const scrollY = await page.evaluate(() => window.scrollY)
    await original.click()
    const detail = page.getByRole("dialog", { name: "制作人名片 12" })
    await expect(detail).toBeVisible()
    await expect(
      detail.getByRole("button", { name: /[上下]一张名片/ })
    ).toHaveCount(0)
    await expect(detail.getByText(/第 \d+ \/ \d+ 张/)).toHaveCount(0)
    const previewTrigger = detail.getByRole("button", {
      name: "放大制作人名片 12 正面",
    })
    await previewTrigger.click()
    const preview = page.getByRole("dialog", {
      name: /制作人名片 12 · (正面|背面)/,
    })
    await expect(
      preview.getByRole("button", { name: /[上下]一张名片/ })
    ).toHaveCount(0)
    await expect(preview.getByText(/第 \d+ \/ \d+ 张/)).toHaveCount(0)
    await expectNamecardPreviewGeometry(page)
    await preview.getByRole("button", { name: "背面", exact: true }).click()
    await expect(
      preview.getByRole("img", { name: "制作人名片 12 背面" })
    ).toBeVisible()
    await attachNamecardScreenshot(page, testInfo, "app-preview-back")
    const accessibility = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze()
    expect(accessibility.violations).toEqual([])
    await preview.getByRole("button", { name: "关闭名片预览" }).click()
    await expect(detail).toBeVisible()
    await expect(previewTrigger).toBeFocused()
    await detail.getByRole("button", { name: "Close" }).click()
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
      reactionReads: 24,
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
    await first.getByRole("button", { name: "查看制作人名片 13 正面" }).click()
    const detail = page.getByRole("dialog", { name: "制作人名片 13" })
    await detail.getByRole("button", { name: "添加反应" }).click()
    await expectNamecardReactionGraphics(page)
    await attachNamecardScreenshot(page, testInfo, "app-uniform-reactions")
    await page
      .getByRole("button", { name: /，添加反应$/ })
      .last()
      .click()
    await expect(
      detail.getByRole("button", { name: "🔘，1 次反应", exact: true })
    ).toHaveText("1")
    await detail.getByRole("button", { name: "Close" }).click()
    await expect(detail).toBeHidden()
    await expect(
      first.getByRole("button", { name: "🔘，1 次反应", exact: true })
    ).toHaveText("1")

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
})
