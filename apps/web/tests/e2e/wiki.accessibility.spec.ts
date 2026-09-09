import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "./fixtures/test"

test.setTimeout(60_000)

test("wiki archive has no automatically detectable WCAG A/AA violations", async ({
  page,
  api,
}) => {
  for (const path of ["/api/wiki/random_bg", "/api/wiki/catalog"]) {
    api.passThrough({
      name: `Wiki accessibility seeded content: ${path}`,
      reason:
        "The accessibility scan intentionally covers the seeded Wiki content.",
      method: "GET",
      path,
      times: 1,
    })
  }
  await page.goto("/wiki")
  await expect(page.getByRole("heading", { name: "剧情档案" })).toBeVisible()
  await expect(page.locator('[aria-label="正在加载内容目录"]')).toHaveCount(0)

  const results = await new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()

  expect(results.violations).toEqual([])
})
