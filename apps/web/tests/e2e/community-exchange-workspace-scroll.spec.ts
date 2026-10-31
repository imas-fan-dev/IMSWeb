import { expect, test } from "./fixtures/test"
import { installBrowserIconMock } from "./fixtures/homepage"

test("merges range offices with their count while retaining the portrait search dock @mobile", async ({
  page,
  api,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() =>
    localStorage.setItem("imsweb.language", "zh-CN")
  )
  await installBrowserIconMock(api)
  await api.mockRoute(
    "/api/community/exchange/series",
    (route) =>
      route.fulfill({
        json: {
          items: ["765", "876", "cg", "ml", "sidem", "sc", "gkm"].map(
            (code, index) => ({
              id: index + 1,
              code,
              displayName: code === "765" ? "765PRO" : `企划 ${code}`,
              color: "#f34f6d",
              iconUrl: null,
              imageTransform: {
                fit: "contain",
                focalX: 0.5,
                focalY: 0.5,
                zoom: 1,
                rotation: 0,
              },
              displayOrder: index,
              activeOfficeCount: 1,
            })
          ),
        },
      }),
    "GET",
    1
  )
  await api.mockRoute(
    "**/api/community/exchange/offices?*",
    (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: "office-1",
              slug: "sample-office",
              name: "示例事务所",
              intro: "正常竖屏列表验收",
              city: "上海",
              address: "示例交换地点",
              accent: "#f34f6d",
              coverUrl: null,
              isOpen: true,
              visitorCount: 1,
              seriesCodes: ["765"],
            },
          ],
          pageInfo: { hasNextPage: false, nextCursor: null },
        },
      }),
    "GET",
    1
  )
  await api.mockRoute(
    "**/api/community/exchange/cards?*",
    (route) =>
      route.fulfill({
        json: { items: [], pageInfo: { hasNextPage: false, nextCursor: null } },
      }),
    "GET",
    1
  )
  await api.mockRoute(
    "/api/community/exchange/map/config",
    (route) =>
      route.fulfill({
        json: {
          provider: "maplibre",
          search: { provider: "nominatim" },
          styleUrl: "/maps/exchange-test-style.json",
        },
      }),
    "GET",
    1
  )
  await api.mockRoute(
    "**/api/community/exchange/map/offices?*",
    (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: "office-1",
              slug: "sample-office",
              name: "示例事务所",
              city: "上海",
              address: "示例交换地点",
              accent: "#f34f6d",
              isOpen: true,
              seriesCodes: ["765"],
              location: {
                latitude: 31.2,
                longitude: 121.5,
                precision: "exact",
              },
            },
          ],
          truncated: false,
        },
      }),
    "GET",
    { min: 1, max: 3 }
  )
  await page.goto("/community/exchange")
  await expect(page.locator("[data-map-results-state]")).toHaveAttribute(
    "data-map-results-state",
    "ready"
  )
  const input = page.getByRole("textbox", { name: "搜索事务所" })
  const retained = await input.elementHandle()
  const dock = await page.locator(".exchange-web-search-dock").boundingBox()
  await expect(
    page.getByRole("complementary", { name: "交换发现栏" })
  ).toHaveCount(0)
  const count = await page.locator("[data-map-office-count]").elementHandle()
  const officeToggle = page.getByRole("button", { name: "范围内事务所列表" })
  await officeToggle.click()
  await expect(page.locator(".exchange-web-drawer")).toHaveAttribute(
    "data-open",
    "false"
  )
  for (const name of ["回到我的位置", "刷新地图结果"]) {
    expect(
      await page.getByRole("button", { name }).evaluate((element) => {
        const r = element.getBoundingClientRect()
        return element.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        )
      })
    ).toBe(true)
  }
  const office = page.getByRole("link", { name: /示例事务所/ })
  await office.scrollIntoViewIfNeeded()
  await office.click()
  const popup = page.getByRole("dialog", { name: "事务所详情" })
  await expect(popup).toHaveClass(/exchange-map-point-popup/)
  await expect(popup.getByRole("heading", { name: "示例事务所" })).toBeVisible()
  await expect(popup).toHaveCSS("opacity", "1")
  expect(
    await page
      .locator("[data-map-office-count]")
      .evaluate((node, old) => node === old, count)
  ).toBe(true)
  expect(
    await input.evaluate((element, previous) => element === previous, retained)
  ).toBe(true)
  expect(await page.locator(".exchange-web-search-dock").boundingBox()).toEqual(
    dock
  )
  await page.screenshot({
    path: testInfo.outputPath("portrait-office-details.png"),
  })
  await popup.getByRole("button", { name: "关闭事务所详情" }).click()
  await expect(popup).toBeHidden()
  await officeToggle.click()
  await office.scrollIntoViewIfNeeded()
  await expect(office).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath("portrait-office-list.png"),
  })
})
