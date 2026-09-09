import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "./fixtures/test"

import { installSeededWikiApis } from "./fixtures/wiki"

test.setTimeout(60_000)

test("wiki archive has no automatically detectable WCAG A/AA violations", async ({
  page,
  api,
}) => {
  installSeededWikiApis(api, [
    { path: "/api/wiki/random_bg", times: 1 },
    { path: "/api/wiki/catalog", times: 1 },
  ])
  await page.goto("/wiki")
  await expect(page.getByRole("heading", { name: "剧情档案" })).toBeVisible()
  await expect(page.locator('[aria-label="正在加载内容目录"]')).toHaveCount(0)

  const results = await new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()

  expect(results.violations).toEqual([])
})
