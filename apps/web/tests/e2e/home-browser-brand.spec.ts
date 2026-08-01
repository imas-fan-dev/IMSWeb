import { expect, test } from "@playwright/test"

test("favicon cycles globally while only the home title changes", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop navigation is used to verify route cleanup")
  await page.clock.install()
  await page.goto("/")

  const icon = page.locator('head link[rel~="icon"]')
  await expect(icon).toHaveCount(1)
  await expect(icon).toHaveAttribute("href", /\/brand\/series\/.+\.png$/)
  const initialIcon = await icon.getAttribute("href")

  await page.clock.fastForward(10_100)
  await expect(page).toHaveTitle("偶像大师交流站")
  await expect(icon).not.toHaveAttribute("href", initialIcon ?? "")

  const eventsLink = page.locator('header a[href="/events"]')
  await expect(eventsLink).toHaveCount(1)
  await eventsLink.click()

  await expect(page).toHaveURL(/\/events$/)
  await expect(page).toHaveTitle("活动中心 | IMSWeb")
  await expect(icon).toHaveAttribute("href", /\/brand\/series\/.+\.png$/)
  const childRouteIcon = await icon.getAttribute("href")

  await page.clock.fastForward(10_100)
  await expect(icon).not.toHaveAttribute("href", childRouteIcon ?? "")
  await expect(page).toHaveTitle("活动中心 | IMSWeb")
})
