import { expect, test } from "./fixtures/test"

import {
  installEmptyWikiCatalogMock,
  installHomepageLinksMock,
  installBirthdaysMock,
} from "./fixtures/homepage"

test.describe("home browser brand", () => {
  test("765PRO favicon stays fixed on home and after client navigation", async ({
    page,
    api,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop navigation is used to verify route cleanup")
    installEmptyWikiCatalogMock(api)
    installHomepageLinksMock(api)
    installBirthdaysMock(api)
    await api.mockRoute(
      "/api/wiki/random_idol",
      (route) => route.fulfill({ status: 500, json: { error: "Unavailable" } }),
      "GET"
    )
    await api.mockRoute(
      "/api/community-posts/spotlight",
      (route) => route.fulfill({ json: { items: [] } }),
      "GET"
    )
    await api.mockRoute(
      "/api/news",
      (route) => route.fulfill({ json: [] }),
      "GET"
    )
    await api.mockRoute(
      "/api/events",
      (route) =>
        route.fulfill({
          json: {
            items: [],
            pageInfo: {
              nextCursor: null,
              hasNextPage: false,
              snapshotAt: null,
            },
          },
        }),
      "GET",
      2
    )
    await page.clock.install()
    await page.goto("/")
    await expect(page.getByRole("link", { name: /活动中心/ })).toBeVisible()

    const icon = page.locator('head link[rel~="icon"]')
    await expect(icon).toHaveCount(1)
    await expect(icon).toHaveAttribute("type", "image/webp")
    await expect(icon).toHaveAttribute("href", "/icon/agencies/1.webp")

    await page.clock.fastForward(10_100)
    await expect(page).toHaveTitle("IMSWeb | 偶像大师交流站")
    await expect(icon).toHaveAttribute("href", "/icon/agencies/1.webp")

    const eventsLink = page.locator('header a[href="/events"]')
    await expect(eventsLink).toHaveCount(1)
    await eventsLink.click()

    await expect(page).toHaveURL(/\/events$/)
    await expect(page.getByText("当前没有已发布社区动态")).toBeVisible()
    await expect(page).toHaveTitle("社区动态 | IMSWeb")
    await page.clock.fastForward(10_100)
    await expect(icon).toHaveAttribute("href", "/icon/agencies/1.webp")
    await expect(page).toHaveTitle("社区动态 | IMSWeb")
  })
})
