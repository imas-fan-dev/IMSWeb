import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "./fixtures/test"

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

test.describe("namecard mobile browsing", () => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    test(`keeps complete faces and preview controls inside ${viewport.width}x${viewport.height}`, async ({
      page,
      api,
    }, testInfo) => {
      await page.setViewportSize(viewport)
      await mockNamecardBrowsing(page, api, 26, undefined, {
        cards: 1,
        reactionReads: 12,
        reactionWrites: 1,
      })
      await page.goto("/community/cards?page=1&size=12")
      await applyNamecardSafeArea(page)
      const front = page.getByRole("button", { name: "查看制作人名片 1 正面" })
      await expect(front).toBeVisible()
      const back = page.getByRole("button", { name: "查看制作人名片 1 背面" })
      await expect(back).toBeVisible()
      await expectNamecardGalleryGeometry(page)
      await attachNamecardScreenshot(page, testInfo, "gallery-dual-face")
      await back.click()
      const detail = page.getByRole("dialog", { name: "制作人名片 1" })
      await expect(detail).toBeVisible()
      await expect(
        detail.getByRole("button", { name: "放大制作人名片 1 背面" })
      ).toBeVisible()
      await detail
        .getByRole("button", { name: "放大制作人名片 1 背面" })
        .click()
      const preview = page.getByRole("dialog", {
        name: "制作人名片 1 · 背面",
      })
      await expect(
        preview.getByRole("img", { name: "制作人名片 1 背面" })
      ).toHaveAttribute("src", "/__namecard-qa/back-1.png")
      await expectNamecardPreviewGeometry(page)
      await attachNamecardScreenshot(page, testInfo, "preview")
      const results = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .analyze()
      expect(results.violations).toEqual([])
      await preview.getByRole("button", { name: "关闭名片预览" }).click()
      await expect(detail).toBeVisible()
      await expectNamecardNoOverflow(page)
      const addReaction = detail.getByRole("button", { name: "添加反应" })
      await expect(addReaction).toHaveAttribute("title", "添加反应")
      const reactionRow = detail.getByLabel("名片全部反应")
      await expect(reactionRow.locator(":scope > :last-child")).toHaveAttribute(
        "aria-label",
        "添加反应"
      )
      const circle = addReaction.locator("span")
      await expect(circle).toHaveCSS("border-top-style", "dashed")
      await expect(circle).toHaveCSS("border-top-left-radius", /px$/)
      const addBox = await addReaction.boundingBox()
      const circleBox = await circle.boundingBox()
      const pillBox = await detail
        .getByRole("button", { name: "👍，2 次反应", exact: true })
        .boundingBox()
      expect(addBox?.width).toBeGreaterThanOrEqual(43.5)
      expect(addBox?.height).toBeGreaterThanOrEqual(43.5)
      expect(pillBox?.height).toBeCloseTo(32, 0)
      expect(circleBox?.width).toBeCloseTo(pillBox!.height, 0)
      expect(circleBox?.height).toBeCloseTo(pillBox!.height, 0)
      expect(circleBox!.y + circleBox!.height / 2).toBeCloseTo(
        pillBox!.y + pillBox!.height / 2,
        0
      )
      expect(circleBox!.x + circleBox!.width / 2).toBeCloseTo(
        addBox!.x + addBox!.width / 2,
        0
      )
      for (const pill of await reactionRow
        .getByRole("button", { name: /次反应$/ })
        .all()) {
        const box = (await pill.boundingBox())!
        const overlaps =
          box.x < addBox!.x + addBox!.width &&
          box.x + box.width > addBox!.x &&
          box.y < addBox!.y + addBox!.height &&
          box.y + box.height > addBox!.y
        expect(overlaps).toBe(false)
      }
      await addReaction.click()
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
        .poll(
          async () => (await pickerButtons.first().boundingBox())?.width ?? 0
        )
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
        detail.getByRole("button", { name: "🔘，1 次反应", exact: true })
      ).toContainText("1")
      await detail.getByRole("button", { name: "Close" }).click()
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
    api,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const browsing = await mockNamecardBrowsing(
      page,
      api,
      26,
      {
        1: {
          "👍": 999999,
          "🎮": 888888,
          "🌹": 777777,
          "🍔": 5,
          "🍭": 6,
          "🔨": 7,
        },
      },
      { cards: 1, reactionReads: 12, reactionWrites: 0 }
    )
    const release = browsing.holdReactions(1)
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
        cards
          .first()
          .getByRole("button", { name: "👍，999999 次反应", exact: true })
      ).toBeVisible()
      await expectNamecardGalleryGeometry(page)
      const after = await cards.evaluateAll((elements) =>
        elements.slice(0, 4).map((element) => element.getBoundingClientRect().y)
      )
      expect(after[0]).toBeCloseTo(after[1]!, 0)
      // Three long mobile summary counts wrap onto an additional row. The
      // next card in that masonry column follows it without moving the other
      // column.
      expect(after[2]! - before[2]!).toBeGreaterThanOrEqual(31.5)
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

  test("shows the mobile top three and all reactions on desktop", async ({
    page,
    api,
  }, testInfo) => {
    await mockNamecardBrowsing(
      page,
      api,
      26,
      { 1: { "❤️": 21, "👍": 13, "🥰": 13, "😍": 11, "✨": 10, "🎮": 6 } },
      { cards: 1, reactionReads: 12, reactionWrites: 0 }
    )
    await page.setViewportSize({ width: 402, height: 874 })
    await page.goto("/community/cards?page=1&size=12")
    const first = page.locator("[data-namecard-item]").first()
    const summary = first.getByLabel("名片反应摘要")
    await expect(summary.getByRole("button", { name: /次反应$/ })).toHaveCount(
      3
    )
    await expect(
      summary.getByRole("button", { name: "添加反应", exact: true })
    ).toHaveCount(0)
    await expect(
      summary.getByRole("button", { name: "❤️，21 次反应", exact: true })
    ).toBeVisible()
    await expect(
      summary.getByRole("button", { name: "👍，13 次反应", exact: true })
    ).toBeVisible()
    await expect(
      summary.getByRole("button", { name: "🥰，13 次反应", exact: true })
    ).toBeVisible()
    const mobileOrder: string[] = []
    await first.getByRole("button", { name: "查看制作人名片 1 正面" }).focus()
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    for (let index = 0; index < 3; index += 1) {
      mobileOrder.push(
        (await page.evaluate(() => document.activeElement?.textContent)) ?? ""
      )
      if (index < 2) await page.keyboard.press("Tab")
    }
    expect(mobileOrder).toEqual(["21", "13", "13"])
    await expectNamecardReactionDensity(page)
    await attachNamecardScreenshot(page, testInfo, "compact-reactions-402")
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      await expect(
        summary.getByRole("button", { name: /次反应$/ })
      ).toHaveCount(3)
      await expect(
        summary.getByRole("button", { name: "添加反应", exact: true })
      ).toHaveCount(0)
      await expectNamecardReactionDensity(page)
      await expectNamecardGalleryGeometry(page)
    }
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(summary.getByRole("button", { name: /次反应$/ })).toHaveCount(
      6
    )
    await expect(
      summary.getByRole("button", { name: "添加反应", exact: true })
    ).toBeVisible()
    await expect(
      summary.getByRole("button", { name: "🎮，6 次反应", exact: true })
    ).toBeVisible()
    await expectNamecardReactionDensity(page)
    await expectNamecardGalleryGeometry(page)
    const accessibility = await new AxeBuilder({ page })
      .include("[data-namecard-item]")
      .analyze()
    expect(accessibility.violations).toEqual([])
  })

  test("keeps all 48 reaction-heavy cards separated without overflowing grid capacity", async ({
    page,
    api,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    const counts = Object.fromEntries(
      ["👍", "❤️", "😂", "🤣", "😭", "😍", "🥰", "😘", "🤯", "😱", "😎"].map(
        (emoji) => [emoji, 999999]
      )
    )
    await mockNamecardBrowsing(
      page,
      api,
      48,
      Object.fromEntries(
        Array.from({ length: 48 }, (_, index) => [index + 1, counts])
      ),
      { cards: 1, reactionReads: 48, reactionWrites: 0 }
    )
    await page.goto("/community/cards?page=1&size=48")
    const cards = page.locator("[data-namecard-item]")
    await expect(cards).toHaveCount(48)
    await expect(
      cards
        .last()
        .getByRole("button", { name: "👍，999999 次反应", exact: true })
    ).toBeAttached()
    await expect
      .poll(() =>
        cards.evaluateAll((elements) => {
          const boxes = elements.map((element) =>
            element.getBoundingClientRect()
          )
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
        (gallery) =>
          getComputedStyle(gallery).gridTemplateRows.split(" ").length
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
    api,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockNamecardBrowsing(page, api, 26, undefined, {
      cards: 4,
      reactionReads: 26,
      reactionWrites: 0,
    })
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
    await expect(page.getByRole("spinbutton", { name: "跳至" })).toHaveValue(
      "1"
    )
    await expectNamecardNoOverflow(page)
  })

  test("keeps the selected card and returns to the original list face and position", async ({
    page,
    api,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const browsing = await mockNamecardBrowsing(page, api, 26, undefined, {
      cards: 1,
      reactionReads: 12,
      reactionWrites: 0,
    })
    await page.goto("/community/cards?page=1&size=12")
    const original = page.getByRole("button", {
      name: "查看制作人名片 12 背面",
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
    await expect(page).toHaveURL(/page=1&size=12$/)
    expect(browsing.requests).toEqual([1])

    const previewTrigger = detail.getByRole("button", {
      name: "放大制作人名片 12 正面",
    })
    await previewTrigger.click()
    const preview = page.getByRole("dialog", {
      name: "制作人名片 12 · 正面",
    })
    await expect(
      preview.getByRole("button", { name: /[上下]一张名片/ })
    ).toHaveCount(0)
    await expect(preview.getByText(/第 \d+ \/ \d+ 张/)).toHaveCount(0)
    await expect(
      preview.getByRole("img", { name: "制作人名片 12 正面" })
    ).toBeVisible()
    await preview.getByRole("button", { name: "放大名片" }).click()
    await expect(preview.getByRole("img")).not.toHaveCSS(
      "transform",
      "matrix(1, 0, 0, 1, 0, 0)"
    )
    await preview.getByRole("button", { name: "关闭名片预览" }).click()
    await expect(detail).toBeVisible()
    await expect(previewTrigger).toBeFocused()
    await detail.getByRole("button", { name: "Close" }).click()
    await expect(detail).toBeHidden()
    await expect(original).toBeFocused()
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(scrollY, 0)
    await expect(page).toHaveURL(/page=1&size=12$/)
    expect(browsing.requests).toEqual([1])
  })
})
