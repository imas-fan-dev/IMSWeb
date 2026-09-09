import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "./fixtures/test"

import { installPublicShellMocks } from "./fixtures/homepage"

test.setTimeout(60_000)

test("home has no automatically detectable WCAG A/AA violations", async ({
  page,
  api,
}) => {
  installPublicShellMocks(api, 1)
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "站点导航" })).toBeVisible()
  await expect(page.locator('[aria-label="正在加载"]')).toHaveCount(0)

  const results = await new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()

  expect(results.violations).toEqual([])
})
