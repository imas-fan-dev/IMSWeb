import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

test.setTimeout(60_000)

test("community hub has no automatically detectable WCAG A/AA violations", async ({
  page,
}) => {
  await page.goto("/community")
  await expect(page.getByRole("heading", { name: "制作人社区" })).toBeVisible()
  await expect(
    page.getByRole("status", { name: "正在确认名片交换事务所" })
  ).toHaveCount(0)

  const results = await new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()

  expect(results.violations).toEqual([])
})
