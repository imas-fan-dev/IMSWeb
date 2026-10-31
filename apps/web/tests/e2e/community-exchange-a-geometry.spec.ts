import { expect, test } from "./fixtures/test"
import { installBrowserIconMock } from "./fixtures/homepage"

test.describe("exchange Web search geometry", () => {
  for (const [width, height] of [
    [1440, 900],
    [1440, 2560],
    [1280, 720],
    [320, 568],
    [390, 844],
    [402, 874],
    [440, 956],
    [768, 1024],
    [900, 1200],
    [1023, 768],
    [844, 390],
    [667, 375],
  ]) {
    test(`retains input and reachable controls at ${width}x${height}`, async ({
      page,
      api,
    }, testInfo) => {
      await page.setViewportSize({ width, height })
      await page.addInitScript(() =>
        localStorage.setItem("imsweb.language", "zh-CN")
      )
      await installBrowserIconMock(api)
      await api.mockRoute(
        "/api/community/exchange/series",
        (route) => route.fulfill({ json: { items: [] } }),
        "GET",
        1
      )
      for (const directory of ["offices", "cards"]) {
        await api.mockRoute(
          `**/api/community/exchange/${directory}?*`,
          (route) =>
            route.fulfill({
              json: {
                items: [],
                pageInfo: { hasNextPage: false, nextCursor: null },
              },
            }),
          "GET",
          1
        )
      }
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
        (route) => route.fulfill({ json: { items: [], truncated: false } }),
        "GET",
        { min: 1, max: 4 }
      )
      let searches = 0
      await api.mockRoute(
        "**/api/community/exchange/places/search?*",
        (route) => {
          searches++
          return route.fulfill({
            json: {
              success: true,
              items: [
                {
                  id: "place:a",
                  label: "西岸艺术中心",
                  address: "上海市徐汇区",
                  city: "上海市",
                  location: {
                    latitude: 31.2,
                    longitude: 121.5,
                    precision: "exact",
                  },
                },
              ],
              attribution: "© OpenStreetMap contributors",
            },
          })
        },
        "GET",
        1
      )
      await page.goto("/community/exchange")
      await expect(page.locator("[data-exchange-office-map]")).toHaveAttribute(
        "data-map-state",
        "ready"
      )
      const workspace = page.getByRole("region", { name: "地点查找" })
      const input = workspace.getByRole("textbox", { name: "搜索地点" })
      await workspace.getByRole("button", { name: "展开地图面板" }).click()
      await workspace.getByRole("tab", { name: "地点", exact: true }).click()
      await workspace.getByRole("button", { name: "收起地图面板" }).click()
      const originalInput = await input.elementHandle()
      const canvas = page.locator("canvas.maplibregl-canvas")
      const mapFrame = await canvas.boundingBox()
      await expect(input).toBeVisible()
      const reachable = () =>
        workspace.locator(".exchange-web-search-dock").evaluate((element) => {
          const controls = [
            ...element.querySelectorAll("button:enabled, input"),
          ]
          return controls.every((control) => {
            const rect = control.getBoundingClientRect()
            return (
              rect.width >= 44 &&
              rect.height >= 44 &&
              rect.top >= 0 &&
              rect.bottom <= innerHeight &&
              rect.left >= 0 &&
              rect.right <= innerWidth &&
              control.contains(
                document.elementFromPoint(
                  rect.x + rect.width / 2,
                  rect.y + rect.height / 2
                )
              )
            )
          })
        })
      await expect.poll(reachable).toBe(true)
      const footerClearance = () =>
        workspace.evaluate(
          (element) =>
            element.parentElement!.getBoundingClientRect().bottom -
            element.getBoundingClientRect().bottom
        )
      await expect.poll(footerClearance).toBeGreaterThanOrEqual(56)
      await page.screenshot({ path: testInfo.outputPath("browse.png") })
      await input.fill("西岸")
      expect(searches).toBe(0)
      await expect.poll(reachable).toBe(true)
      await expect.poll(() => canvas.boundingBox()).toEqual(mapFrame)
      await workspace.getByRole("button", { name: "搜索", exact: true }).click()
      const result = workspace.getByRole("button", {
        name: "西岸艺术中心 上海市徐汇区",
        exact: true,
      })
      await expect(result).toBeVisible()
      await result.scrollIntoViewIfNeeded()
      // Visibility can precede the drawer's expansion and result entry motion.
      await expect
        .poll(() =>
          result.evaluate((element) => {
            const rect = element.getBoundingClientRect()
            return element.contains(
              document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2
              )
            )
          })
        )
        .toBe(true)
      await page.screenshot({ path: testInfo.outputPath("results.png") })
      await result.click()
      await expect(input).toBeFocused()
      await expect(input).toHaveValue("西岸艺术中心")
      expect(
        await input.evaluate(
          (element, original) => element === original,
          originalInput
        )
      ).toBe(true)
      await expect(workspace.getByRole("status")).toContainText(
        "已定位：西岸艺术中心"
      )
      await expect.poll(reachable).toBe(true)
      await expect.poll(() => canvas.boundingBox()).toEqual(mapFrame)
      await expect.poll(footerClearance).toBeGreaterThanOrEqual(56)
      await expect(
        page.getByRole("button", { name: "回到我的位置" })
      ).toBeInViewport()
      await expect(
        page.getByRole("button", { name: "刷新地图结果" })
      ).toBeInViewport()
      await page.screenshot({ path: testInfo.outputPath("selected.png") })
      expect(searches).toBe(1)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true)
    })
  }
})
