import { expect, test } from "./fixtures/test"
import { installBrowserIconMock } from "./fixtures/homepage"

test.describe("A exchange DOM geometry", () => {
  for (const [width, height] of [
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
    test(`fits separate surfaces and control hits at ${width}x${height}`, async ({
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
            json: { styleUrl: "/maps/exchange-test-style.json" },
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
      const card = page.getByRole("region", { name: "地点查找" })
      const measure = () =>
        card.evaluate((element) => {
          const surface = element
            .querySelector(".exchange-search-surface")!
            .getBoundingClientRect()
          const tools = element
            .querySelector(".exchange-search-tools")!
            .getBoundingClientRect()
          const controls = document
            .querySelector("[data-exchange-side-controls]")!
            .getBoundingClientRect()
          const refresh = document
            .querySelector(".exchange-map-refresh-button")!
            .getBoundingClientRect()
          const locate = document
            .querySelector('[data-native-glass-control="locate"]')!
            .getBoundingClientRect()
          const hit = (button: Element) => {
            const box = button.getBoundingClientRect()
            return (
              box.width >= 44 &&
              box.height >= 44 &&
              box.top >= 0 &&
              box.bottom <= innerHeight &&
              button.contains(
                document.elementFromPoint(
                  box.x + box.width / 2,
                  box.y + box.height / 2
                )
              )
            )
          }
          const gapX = surface.x + surface.width / 2
          const gapY = (surface.bottom + tools.top) / 2
          const gapHit = document.elementFromPoint(gapX, gapY)
          return {
            width: Math.round(surface.width * 10) / 10,
            separate: tools.top - surface.bottom >= 12,
            mapGap: !element.contains(gapHit),
            hits: [
              ...element.querySelectorAll("button"),
              ...document.querySelectorAll(
                "[data-exchange-side-controls] button"
              ),
            ].every(hit),
            controlsClear:
              controls.bottom <= surface.top - 12 ||
              controls.left >= surface.right + 12,
            grouped:
              Math.abs(refresh.bottom - locate.top) <= 1 &&
              Math.abs(refresh.x - locate.x) <= 1,
          }
        })
      const expectedWidth =
        Math.round(
          (height <= 500 && width >= 640
            ? Math.min(420, Math.max(320, width * 0.48))
            : width < 768
              ? width - 16
              : Math.min(560, width - 16)) * 10
        ) / 10
      await expect.poll(measure).toEqual({
        width: expectedWidth,
        separate: true,
        mapGap: true,
        hits: true,
        controlsClear: true,
        grouped: true,
      })
      await page.screenshot({ path: testInfo.outputPath("a-browse.png") })
      await card.getByRole("button", { name: "查找地点", exact: true }).click()
      const input = card.getByRole("textbox", { name: "搜索地点" })
      await expect(input).toBeFocused()
      await input.fill("西岸")
      expect(searches).toBe(0)
      await expect
        .poll(() =>
          card.evaluate((element) => {
            const targets = element.querySelectorAll(
              ".exchange-search-row input, .exchange-search-row button, .exchange-search-actions button"
            )
            return [...targets].every((target) => {
              const box = target.getBoundingClientRect()
              return (
                box.width >= 44 &&
                box.height >= 44 &&
                box.top >= 0 &&
                box.bottom <= innerHeight &&
                target.contains(
                  document.elementFromPoint(
                    box.x + box.width / 2,
                    box.y + box.height / 2
                  )
                )
              )
            })
          })
        )
        .toBe(true)
      await page.screenshot({ path: testInfo.outputPath("a-edit.png") })
      await card.getByRole("button", { name: "查找", exact: true }).click()
      const result = card.getByRole("button", {
        name: "西岸艺术中心 上海市徐汇区",
        exact: true,
      })
      await expect(result).toBeVisible()
      expect(
        await result.evaluate((element) => {
          const box = element.getBoundingClientRect()
          return (
            box.top >= 0 &&
            box.bottom <= innerHeight &&
            element.contains(
              document.elementFromPoint(
                box.x + box.width / 2,
                box.y + box.height / 2
              )
            )
          )
        })
      ).toBe(true)
      await page.screenshot({ path: testInfo.outputPath("a-results.png") })
      await result.click()
      const selected = card.getByRole("button", {
        name: "已定位：西岸艺术中心，展开地点查找",
      })
      await expect(selected).toBeFocused()
      await expect(
        card.getByRole("button", { name: "查找地点", exact: true })
      ).toHaveCount(0)
      await expect.poll(measure).toEqual({
        width: expectedWidth,
        separate: true,
        mapGap: true,
        hits: true,
        controlsClear: true,
        grouped: true,
      })
      await page.screenshot({ path: testInfo.outputPath("a-selected.png") })
      expect(searches).toBe(1)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true)
    })
  }
})
