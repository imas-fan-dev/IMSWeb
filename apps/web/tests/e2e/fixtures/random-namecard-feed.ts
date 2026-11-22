import type { Page, TestInfo } from "@playwright/test"

import { expect } from "./test"

export async function expectRandomNamecardFeed(page: Page, testInfo: TestInfo) {
  const feed = page.getByRole("region", { name: "公开名片" })
  const toggle = page.getByRole("button", { name: "筛选", exact: true })
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await expect(page.getByRole("textbox", { name: "制作人名称" })).toBeHidden()
  await expect(page.getByRole("combobox", { name: "排序方式" })).toContainText(
    "随机发现"
  )
  await expect(feed.locator("[data-namecard-item]")).toHaveCount(12)
  const before = new URL(page.url()).searchParams
  const seed = before.get("seed")
  expect(seed).toMatch(/^[A-Za-z0-9_-]+$/)
  await expect(page.getByRole("navigation", { name: "名片分页" })).toHaveCount(
    0
  )

  await expect(feed).toHaveCSS("overflow-y", "visible")
  await expect(feed).toHaveCSS("max-height", "none")
  await expect(
    feed.getByRole("button", { name: "加载更多名片" })
  ).not.toBeInViewport()
  const startY = await page.evaluate(() => scrollY)
  const path = testInfo.outputPath("random-wall-initial.png")
  await page.screenshot({ path, animations: "disabled" })
  await testInfo.attach("random-wall-initial", {
    path,
    contentType: "image/png",
  })

  await feed
    .getByRole("button", { name: "加载更多名片" })
    .evaluate((button) =>
      button.scrollIntoView({ behavior: "instant", block: "center" })
    )
  await expect(feed.locator("[data-namecard-item]")).toHaveCount(24)
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(startY)
  expect(await feed.evaluate((element) => element.scrollTop)).toBe(0)
  expect(new URL(page.url()).searchParams.get("seed")).toBe(seed)
  expect(new URL(page.url()).searchParams.get("page")).toBe("1")
  await expect(feed.getByText("已浏览完本轮名片")).toBeVisible()

  await toggle.click()
  await expect(page.getByRole("textbox", { name: "制作人名称" })).toBeVisible()
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
}
