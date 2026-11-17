import type { Page, TestInfo } from "@playwright/test"
import { expect, type ApiDispatcher } from "./test"
import { installEmptyWikiCatalogMock } from "./homepage"

const office = {
  id: "search-office",
  slug: "search-office",
  name: "上海交换事务所",
  intro: "线下交换点",
  city: "上海",
  address: "徐汇区",
  accent: "#f34f6d",
  coverUrl: null,
  isOpen: true,
  visitorCount: 12,
  seriesCodes: [],
  location: { latitude: 31.2, longitude: 121.5, precision: "exact" },
}
const empty = { items: [], pageInfo: { hasNextPage: false, nextCursor: null } }

export async function installUnifiedSearchApis(
  api: ApiDispatcher,
  beforeSearch?: (query: string) => Promise<void>
) {
  const queries: string[] = []
  await installEmptyWikiCatalogMock(api, { min: 0, max: 8 })
  await api.mockRoute(
    "/api/community/exchange/series",
    (r) => r.fulfill({ json: { items: [] } }),
    "GET",
    { min: 1, max: 8 }
  )
  await api.mockRoute(
    "**/api/community/exchange/offices?*",
    async (r) => {
      const q = new URL(r.request().url()).searchParams.get("q")
      if (q) {
        queries.push(q)
        await beforeSearch?.(q)
      }
      return r.fulfill({ json: { ...empty, items: q ? [office] : [] } })
    },
    "GET",
    { min: 1, max: 8 }
  )
  await api.mockRoute(
    "**/api/community/exchange/cards?*",
    (r) => r.fulfill({ json: empty }),
    "GET",
    { min: 0, max: 8 }
  )
  await api.mockRoute(
    "/api/community/exchange/map/config",
    (r) =>
      r.fulfill({
        json: {
          provider: "maplibre",
          search: { provider: "nominatim" },
          styleUrl: "/maps/exchange-test-style.json",
        },
      }),
    "GET",
    { min: 1, max: 4 }
  )
  await api.mockRoute(
    "**/api/community/exchange/map/offices?*",
    (r) => r.fulfill({ json: { items: [], truncated: false } }),
    "GET",
    { min: 1, max: 12 }
  )
  await api.mockRoute(
    "**/api/community/exchange/places/search?*",
    (r) =>
      r.fulfill({
        json: {
          success: true,
          items: [
            {
              id: "place:1",
              label: "上海地点",
              address: "上海徐汇",
              city: "上海",
              location: {
                longitude: 121.5,
                latitude: 31.2,
                precision: "exact",
              },
            },
          ],
          attribution: "© OpenStreetMap contributors",
        },
      }),
    "GET",
    { min: 0, max: 4 }
  )
  await api.mockRoute(
    "/api/community/exchange/offices/search-office",
    (r) => r.fulfill({ json: { office: { ...office, cards: [] } } }),
    "GET",
    { min: 0, max: 4 }
  )
  return queries
}

export async function exerciseUnifiedSearch(
  page: Page,
  info: TestInfo,
  app: boolean
) {
  await page.goto("/community/exchange?view=map")
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible()
  const retained = await page
    .locator("canvas.maplibregl-canvas")
    .elementHandle()
  if (app) await page.getByRole("button", { name: "查找事务所" }).click()
  const input = page.getByRole("textbox", { name: "搜索事务所" })
  await input.fill("上海")
  await input.press("Enter")
  await expect(
    page.getByRole("tab", { name: "事务所", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  await expect(
    page.getByRole("button", { name: /上海交换事务所/ })
  ).toBeVisible()
  await page.screenshot({ path: info.outputPath("office-tab.png") })
  await page.getByRole("tab", { name: "地点", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "搜索地点" })).toHaveValue(
    "上海"
  )
  await expect(page.getByRole("button", { name: /上海地点/ })).toBeVisible()
  await expect(
    page.getByRole("button", { name: /上海交换事务所/ })
  ).toHaveCount(0)
  await page.screenshot({ path: info.outputPath("place-tab.png") })
  expect(await retained?.evaluate((node) => node.isConnected)).toBe(true)
  await page.getByRole("tab", { name: "事务所", exact: true }).click()
  await page.getByRole("button", { name: /上海交换事务所/ }).click()
  await expect(
    page.getByRole("img", { name: "搜索地点：上海交换事务所" })
  ).toBeVisible()
  expect(await retained?.evaluate((node) => node.isConnected)).toBe(true)
  await expect(page.getByRole("dialog", { name: "事务所详情" })).toHaveCount(0)
}
