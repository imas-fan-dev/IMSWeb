import { expect, test } from "./fixtures/test"

import {
  attachNamecardScreenshot,
  expectNamecardNoOverflow,
  expectNamecardReactionGraphics,
  mockNamecardBrowsing,
} from "./fixtures/namecard-browsing"

test.describe("namecard desktop reactions", () => {
  test("closes the desktop picker across the mobile breakpoint and restores detail entry focus @mobile", async ({
    page,
    api,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await mockNamecardBrowsing(
      page,
      api,
      26,
      { 1: { "❤️": 4, "👍": 2 } },
      { cards: 1, reactionReads: 12, reactionWrites: 1 }
    )
    await page.goto("/community/cards?page=1&size=12")
    const summary = page
      .locator("[data-namecard-item]")
      .first()
      .getByLabel("名片反应摘要")
    await expect(
      summary.getByRole("button", { name: "❤️，4 次反应", exact: true })
    ).toBeVisible()
    await summary.getByRole("button", { name: "添加反应", exact: true }).click()
    const picker = page.locator('[data-slot="popover-content"]')
    await expect(picker).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(picker).toBeHidden()
    await expect(
      summary.getByRole("button", { name: "添加反应", exact: true })
    ).toHaveCount(0)
    const mobileReaction = summary.getByRole("button", {
      name: "❤️，4 次反应",
      exact: true,
    })
    await expect(mobileReaction).toBeFocused()
    expect(
      api.requests({ method: "POST", path: "/api/reactions" })
    ).toHaveLength(0)
    await mobileReaction.press("Enter")
    const detail = page.getByRole("dialog", {
      name: "制作人名片 1",
      exact: true,
    })
    await expect(detail).toBeVisible()
    await detail.getByRole("button", { name: "添加反应", exact: true }).click()
    await expect(picker).toBeVisible()
    await page.setViewportSize({ width: 320, height: 568 })
    await expect(picker).toBeVisible()
    await picker
      .getByRole("button", { name: "❤️，添加反应", exact: true })
      .click()
    await expect(
      detail.getByRole("button", { name: "❤️，5 次反应", exact: true })
    ).toBeVisible()
    await expect(picker).toBeHidden()
    expect(
      api
        .requests({ method: "POST", path: "/api/reactions" })
        .map(({ jsonBody }) => jsonBody)
    ).toEqual([{ id: 1, emoji: "❤️" }])
  })

  test("submits a list chip and a keyboard picker choice before showing shared counts in detail", async ({
    page,
    api,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await mockNamecardBrowsing(
      page,
      api,
      26,
      { 1: { "❤️": 4, "👍": 2 } },
      { cards: 1, reactionReads: 12, reactionWrites: 2 }
    )
    await page.goto("/community/cards?page=1&size=12")
    const card = page.locator("[data-namecard-item]").first()
    const summary = card.getByLabel("名片反应摘要")
    const add = summary.getByRole("button", { name: "添加反应", exact: true })
    await expect(
      summary.getByRole("button", { name: "❤️，4 次反应", exact: true })
    ).toBeVisible()
    await expect(add).toBeVisible()
    await expect(add).toHaveAttribute("title", "添加反应")

    const geometry = await summary.evaluate((group) => {
      const rect = (element: Element) => {
        const box = element.getBoundingClientRect()
        return {
          x: box.x,
          y: box.y,
          right: box.right,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
        }
      }
      const trigger = group.querySelector('button[aria-label="添加反应"]')!
      return {
        add: rect(trigger),
        circle: rect(trigger.querySelector("span")!),
        pills: Array.from(group.querySelectorAll("button"))
          .filter(
            (button) =>
              button.getAttribute("aria-label")?.endsWith("次反应") &&
              button.getClientRects().length > 0
          )
          .map(rect),
      }
    })
    expect(geometry.pills).toHaveLength(2)
    expect(geometry.add.width).toBeGreaterThanOrEqual(43.5)
    expect(geometry.add.height).toBeGreaterThanOrEqual(43.5)
    expect(geometry.circle.width).toBeCloseTo(32, 0)
    expect(geometry.circle.height).toBeCloseTo(32, 0)
    await expect(add.locator("span")).toHaveCSS("border-top-style", "dashed")
    for (const pill of geometry.pills) {
      expect(pill.height).toBeCloseTo(32, 0)
      const overlaps =
        Math.min(pill.right, geometry.add.right) -
          Math.max(pill.x, geometry.add.x) >
          0.5 &&
        Math.min(pill.bottom, geometry.add.bottom) -
          Math.max(pill.y, geometry.add.y) >
          0.5
      expect(overlaps).toBe(false)
    }

    await summary
      .getByRole("button", { name: "❤️，4 次反应", exact: true })
      .click()
    await expect(
      summary.getByRole("button", { name: "❤️，5 次反应", exact: true })
    ).toBeVisible()
    await expect(page.getByRole("dialog", { name: /^制作人名片/ })).toHaveCount(
      0
    )

    await add.focus()
    await expect(add).toBeFocused()
    await page.keyboard.press("Enter")
    const picker = page.locator('[data-slot="popover-content"]')
    await expect(picker).toBeVisible()
    await expect(picker.getByText("选择反应", { exact: true })).toBeVisible()
    await expect(
      picker.getByRole("button", { name: /，添加反应$/ })
    ).toHaveCount(46)
    await expect(page.getByRole("dialog", { name: /^制作人名片/ })).toHaveCount(
      0
    )
    const choice = picker.getByRole("button", {
      name: "🧒，添加反应",
      exact: true,
    })
    await choice.focus()
    await expect(choice).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(
      summary.getByRole("button", { name: "🧒，1 次反应", exact: true })
    ).toBeVisible()
    await expect(picker).toBeHidden()
    await expect(add).toBeFocused()
    await expect(page.getByRole("dialog", { name: /^制作人名片/ })).toHaveCount(
      0
    )
    expect(
      api
        .requests({ method: "POST", path: "/api/reactions" })
        .map(({ jsonBody }) => jsonBody)
    ).toEqual([
      { id: 1, emoji: "❤️" },
      { id: 1, emoji: "🧒" },
    ])
    await expectNamecardNoOverflow(page)

    await card
      .getByRole("button", { name: "查看制作人名片 1 正面", exact: true })
      .click()
    const detail = page.getByRole("dialog", {
      name: "制作人名片 1",
      exact: true,
    })
    await expect(detail).toBeVisible()
    await expect(
      detail.getByRole("button", { name: "❤️，5 次反应", exact: true })
    ).toBeVisible()
    await expect(
      detail.getByRole("button", { name: "🧒，1 次反应", exact: true })
    ).toBeVisible()
    await expect(
      detail.getByRole("button", { name: "👍，2 次反应", exact: true })
    ).toBeVisible()
  })

  test("places an opaque picker inside the viewport and lets an empty desktop card receive reactions @firefox", async ({
    page,
    api,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await mockNamecardBrowsing(
      page,
      api,
      26,
      { 1: {} },
      { cards: 1, reactionReads: 12, reactionWrites: 2 }
    )
    await page.goto("/community/cards?page=1&size=12")
    const summary = page
      .locator("[data-namecard-item]")
      .first()
      .getByLabel("名片反应摘要")
    await expect(summary).toHaveAttribute("aria-busy", "false")
    await expect(summary.getByRole("button", { name: /次反应$/ })).toHaveCount(
      0
    )
    await expect(
      summary.getByRole("button", { name: "查看详情", exact: true })
    ).toHaveCount(0)
    const add = summary.getByRole("button", { name: "添加反应", exact: true })
    await add.click()
    const picker = page.locator('[data-slot="popover-content"]')
    await expect(picker).toBeVisible()
    await expect(picker).toHaveCSS("animation-name", "none")
    await expect(picker).toHaveCSS("opacity", "1")
    await expect(
      picker.getByRole("button", { name: /，添加反应$/ })
    ).toHaveCount(46)
    await expectNamecardReactionGraphics(page)
    await expect
      .poll(() =>
        picker.evaluate((element) => {
          const box = element.getBoundingClientRect()
          const controls = Array.from(element.querySelectorAll("button"))
          return (
            box.width > 0 &&
            box.height > 0 &&
            box.left >= -0.5 &&
            box.right <= innerWidth + 0.5 &&
            box.top >= -0.5 &&
            box.bottom <= innerHeight + 0.5 &&
            controls.length === 46 &&
            controls.every((button) => {
              const target = button.getBoundingClientRect()
              return (
                target.width >= 43.5 &&
                target.height >= 43.5 &&
                target.left >= box.left - 0.5 &&
                target.right <= box.right + 0.5
              )
            })
          )
        })
      )
      .toBe(true)
    await expect(page.getByRole("dialog", { name: /^制作人名片/ })).toHaveCount(
      0
    )
    await attachNamecardScreenshot(
      page,
      testInfo,
      "desktop-list-reaction-picker"
    )
    await picker
      .getByRole("button", { name: "👍，添加反应", exact: true })
      .click()
    await expect(
      summary.getByRole("button", { name: "👍，1 次反应", exact: true })
    ).toBeVisible()
    await expect(picker).toBeHidden()
    await expect(add).toBeFocused()

    await add.press("Enter")
    await expect(picker).toBeVisible()
    await expect(picker).toHaveCSS("opacity", "1")
    await picker
      .getByRole("button", { name: "❤️，添加反应", exact: true })
      .click()
    await expect(
      summary.getByRole("button", { name: "❤️，1 次反应", exact: true })
    ).toBeVisible()
    await expect(summary.getByRole("button", { name: /次反应$/ })).toHaveCount(
      2
    )
    await expect(picker).toBeHidden()
    await expect(page.getByRole("dialog", { name: /^制作人名片/ })).toHaveCount(
      0
    )
    expect(
      api
        .requests({ method: "POST", path: "/api/reactions" })
        .map(({ jsonBody }) => jsonBody)
    ).toEqual([
      { id: 1, emoji: "👍" },
      { id: 1, emoji: "❤️" },
    ])
    await expectNamecardNoOverflow(page)
  })
})
