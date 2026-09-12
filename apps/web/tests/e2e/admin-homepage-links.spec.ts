import { expect, test } from "./fixtures/test"

import { installAdminAuthMock } from "./fixtures/admin-auth"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"

const navigationLinks = [
  {
    id: "navigation-events",
    section: "navigation",
    title: "活动中心",
    description: "浏览近期活动与公开信息",
    href: "/events",
    icon: "calendar",
    accent: "franchise-765",
    displayOrder: 0,
  },
  {
    id: "navigation-recommendations",
    section: "navigation",
    title: "内容推荐",
    description: "发现社区作品与精选内容",
    href: "/recommendations",
    icon: "book-open",
    accent: "franchise-cg",
    displayOrder: 1,
  },
]

test("admin reorders homepage links with the drag handle", async ({
  page,
  api,
}) => {
  installEmptyWikiCatalogMock(api)
  let orderedLinks = navigationLinks
  let submittedOrder: string[] | undefined

  await installAdminAuthMock(page, api, {
    csrfToken: "homepage-links-e2e",
    user: {
      username: "homepage-operator",
      producername: "首页运营",
    },
  })
  const handleHomepageLinks = async (
    route: import("@playwright/test").Route
  ) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname

    if (
      request.method() === "PUT" &&
      pathname === "/api/admin/homepage-links/navigation/order"
    ) {
      const body = request.postDataJSON() as { ids: string[] }
      submittedOrder = body.ids
      const byId = new Map(orderedLinks.map((link) => [link.id, link]))
      orderedLinks = body.ids.map((id, index) => ({
        ...byId.get(id)!,
        displayOrder: index,
      }))
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      })
      return
    }

    if (
      request.method() === "GET" &&
      pathname === "/api/admin/homepage-links"
    ) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          sections: {
            navigation: orderedLinks,
            friend: [],
            support: [],
          },
        }),
      })
      return
    }

    await route.abort()
  }
  await api.mockRoute(
    "/api/admin/homepage-links",
    handleHomepageLinks,
    "GET",
    2
  )
  await api.mockRoute(
    "/api/admin/homepage-links/navigation/order",
    handleHomepageLinks,
    "PUT"
  )

  await page.goto("/admin/homepage")

  const panel = page.getByRole("region", { name: "站点导航" })
  await expect(panel.getByRole("article")).toHaveCount(2)

  const firstHandle = panel.getByRole("button", {
    name: "拖动排序：活动中心",
  })
  const secondHandle = panel.getByRole("button", {
    name: "拖动排序：内容推荐",
  })
  const firstBox = await firstHandle.boundingBox()
  const secondBox = await secondHandle.boundingBox()
  expect(firstBox).not.toBeNull()
  expect(secondBox).not.toBeNull()
  await page.mouse.move(
    firstBox!.x + firstBox!.width / 2,
    firstBox!.y + firstBox!.height / 2
  )
  await page.mouse.down()
  await page.mouse.move(
    firstBox!.x + firstBox!.width / 2,
    firstBox!.y + firstBox!.height / 2 + 8,
    { steps: 2 }
  )
  await page.mouse.move(
    secondBox!.x + secondBox!.width / 2,
    secondBox!.y + secondBox!.height / 2,
    { steps: 8 }
  )
  await page.mouse.up()

  await expect
    .poll(() => submittedOrder)
    .toEqual(["navigation-recommendations", "navigation-events"])
  await expect(panel.locator("article h3")).toHaveText(["内容推荐", "活动中心"])

  const hasHorizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  )
  expect(hasHorizontalOverflow).toBe(false)
})
