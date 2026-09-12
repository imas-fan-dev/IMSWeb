import { expect, test } from "./fixtures/test"

import {
  browserIconUrls,
  installBrowserIconMock,
  installHomepageLinksMock,
} from "./fixtures/homepage"

test("favicon cycles globally while only the home title changes", async ({
  page,
  api,
  isMobile,
}) => {
  test.skip(isMobile, "desktop navigation is used to verify route cleanup")
  await installBrowserIconMock(api)
  installHomepageLinksMock(api)
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

  const icon = page.locator('head link[rel~="icon"]')
  await expect(icon).toHaveCount(1)
  await expect(icon).toHaveAttribute("type", "image/webp")
  await expect
    .poll(async () => {
      const href = await icon.getAttribute("href")
      return href
        ? browserIconUrls.includes(
            new URL(href, page.url())
              .pathname as (typeof browserIconUrls)[number]
          )
        : false
    })
    .toBe(true)
  const initialIcon = await icon.getAttribute("href")

  await page.clock.fastForward(10_100)
  await expect(page).toHaveTitle("偶像大师交流站")
  await expect(icon).not.toHaveAttribute("href", initialIcon ?? "")

  const eventsLink = page.locator('header a[href="/events"]')
  await expect(eventsLink).toHaveCount(1)
  await eventsLink.click()

  await expect(page).toHaveURL(/\/events$/)
  await expect(page).toHaveTitle("社区动态 | IMSWeb")
  await expect(icon).toHaveAttribute("type", "image/webp")
  const childRouteIcon = await icon.getAttribute("href")

  await page.clock.fastForward(10_100)
  await expect(icon).not.toHaveAttribute("href", childRouteIcon ?? "")
  await expect(page).toHaveTitle("社区动态 | IMSWeb")
})
