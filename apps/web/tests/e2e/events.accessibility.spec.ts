import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

test.setTimeout(60_000)

test("events center has no automatically detectable WCAG A/AA violations", async ({
  page,
}) => {
  await page.route("**/api/events?**", async (route) => {
    await route.fulfill({
      json: {
        items: [
          {
            id: "1",
            title: "无障碍测试动态",
            name: "测试发布者",
            contact: null,
            image_url: null,
            created_at: "2026-09-03T00:00:00.000Z",
          },
        ],
        pageInfo: {
          nextCursor: null,
          hasNextPage: false,
          snapshotAt: "1",
        },
      },
    })
  })

  await page.goto("/events")
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "社区动态",
      exact: true,
    })
  ).toBeVisible()
  await expect(page.locator('[aria-label="正在加载活动"]')).toHaveCount(0)

  const results = await new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()

  expect(results.violations).toEqual([])
})
