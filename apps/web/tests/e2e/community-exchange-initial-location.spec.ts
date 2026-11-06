import { expect, test } from "./fixtures/test"
import { installBrowserIconMock } from "./fixtures/homepage"
import { installSeededPublicApis } from "./fixtures/public-content"

for (const outcome of [
  "success",
  "denied",
  "unavailable",
  "timeout",
] as const) {
  test(`automatically locates on entry with ${outcome} fallback`, async ({
    page,
    api,
    context,
  }) => {
    const coordinates = { longitude: 121.5, latitude: 31.2 }
    await page.emulateMedia({ reducedMotion: "reduce" })
    if (outcome === "success") {
      await context.grantPermissions(["geolocation"])
      await context.setGeolocation(coordinates)
    } else {
      await page.addInitScript(
        (code) => {
          Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
            value: (
              _success: PositionCallback,
              error: PositionErrorCallback | null
            ) =>
              error?.({
                code,
                message: "location unavailable",
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3,
              }),
          })
        },
        outcome === "denied" ? 1 : outcome === "unavailable" ? 2 : 3
      )
    }
    await installBrowserIconMock(api)
    installSeededPublicApis(api, [
      { path: "/api/community/exchange/series", times: 1 },
      { path: "/api/community/exchange/offices", times: 1 },
      { path: "/api/community/exchange/cards", times: 1 },
      { path: "/api/community/exchange/map/config", times: 1 },
    ])
    const bounds: number[][] = []
    await api.mockRoute(
      "**/api/community/exchange/map/offices?*",
      (route) => {
        bounds.push(
          new URL(route.request().url()).searchParams
            .get("bbox")!
            .split(",")
            .map(Number)
        )
        return route.fulfill({ json: { items: [], truncated: false } })
      },
      "GET",
      { min: 1, max: 5 }
    )
    await page.goto("/community/exchange")
    await expect(page.locator("[data-map-results-state]")).toHaveAttribute(
      "data-map-results-state",
      "ready",
      { timeout: 15000 }
    )
    const nearUser = () =>
      bounds.some(
        ([west, south, east, north]) =>
          east - west < 10 &&
          Math.abs((west + east) / 2 - coordinates.longitude) < 0.1 &&
          Math.abs((south + north) / 2 - coordinates.latitude) < 0.1
      )
    if (outcome === "success") {
      await expect(
        page.getByRole("img", { name: "您的当前位置" })
      ).toBeVisible()
      await expect.poll(nearUser).toBe(true)
    } else {
      await expect(
        page.getByRole("button", { name: "回到我的位置" })
      ).toBeEnabled()
      expect(nearUser()).toBe(false)
      await expect(page.getByRole("img", { name: "您的当前位置" })).toHaveCount(
        0
      )
      await expect(
        page.getByText(/未获得位置权限|暂时无法获取您的位置/)
      ).toHaveCount(0)
      await expect(page.locator("[data-exchange-office-map]")).toHaveAttribute(
        "data-map-state",
        "ready"
      )
    }
  })
}
