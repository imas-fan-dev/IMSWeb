import { expect, test } from "@playwright/test"

test("home cycles the browser title and favicon", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop navigation is used to verify route cleanup")
  await page.goto("/")

  const icon = page.locator('head link[rel~="icon"]')
  await expect(icon).toHaveCount(1)
  await expect(icon).toHaveAttribute("href", /\/brand\/series\/.+\.png$/)
  const initialIcon = await icon.getAttribute("href")

  await page.waitForTimeout(10_100)
  await expect(page).toHaveTitle("偶像大师交流站")
  await expect(icon).not.toHaveAttribute("href", initialIcon ?? "")

  const eventsLink = page.locator('header a[href="/events"]')
  await expect(eventsLink).toHaveCount(1)
  await eventsLink.click()

  await expect(page).toHaveURL(/\/events$/)
  await expect(page).toHaveTitle("活动中心 | IMSWeb")
  await expect(icon).toHaveAttribute("href", "/favicon.ico")
})
