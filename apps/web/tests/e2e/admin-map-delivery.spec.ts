import AxeBuilder from "@axe-core/playwright"
import {
  fudabaMapDeliveryMutationSchema,
  fudabaMapDeliverySnapshotSchema,
  fudabaMapSourceActivationSchema,
  type FudabaMapDeliverySnapshot,
} from "@imsweb/contracts/fudaba"
import { expect, test } from "./fixtures/test"
import { installAdminAuthMock } from "./fixtures/admin-auth"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"

test("switches regional search with a fixed Mapbox basemap to one source and preserves provider configurations @mobile", async ({
  page,
  api,
}, testInfo) => {
  await installAdminAuthMock(page, api, { user: { adminRole: "super_admin" } })
  installEmptyWikiCatalogMock(api)
  let current: FudabaMapDeliverySnapshot = {
    sources: [
      {
        id: "default",
        provider: "maplibre",
        name: "OpenFreeMap",
        styleUrl: "https://tiles.openfreemap.org/styles/positron",
      },
      {
        id: "mainland",
        name: "国内高德",
        provider: "amap",
        apiKey: "public-amap-key-1234567890",
        securityProxyUrl: "/_AMapService",
        mapStyle: "amap://styles/normal",
      },
      {
        id: "overseas",
        name: "海外 Mapbox",
        provider: "mapbox",
        accessToken: "pk.public-mapbox-token-1234567890",
        styleUrl: "mapbox://styles/mapbox/streets-v12",
      },
    ],
    activeSourceId: "default",
    effectiveStyleUrl: "https://tiles.openfreemap.org/styles/positron",
    revision: "etag-1",
    routing: { mainlandSourceId: "mainland", overseasSourceId: "overseas" },
  }
  api.expect({
    name: "map source collection",
    method: "GET",
    path: "/api/admin/community/exchange/map-delivery",
    responses: { 200: fudabaMapDeliverySnapshotSchema },
    handle: () => ({ status: 200, json: current }),
  })
  let mutations = 0
  const originalSources = JSON.stringify(current.sources)
  api.expect({
    name: "save single-source and regional search selections",
    method: "PUT",
    path: "/api/admin/community/exchange/map-delivery/active",
    body: fudabaMapSourceActivationSchema,
    responses: { 200: fudabaMapDeliveryMutationSchema },
    times: 2,
    handle: ({ body }) => {
      const routing =
        mutations === 0
          ? null
          : { mainlandSourceId: "mainland", overseasSourceId: "overseas" }
      expect(body).toEqual({
        sourceId: "default",
        revision: `etag-${mutations + 1}`,
        routing,
      })
      mutations++
      current = {
        ...current,
        revision: `etag-${mutations + 1}`,
      }
      if (routing) current.routing = routing
      else delete current.routing
      expect(JSON.stringify(current.sources)).toBe(originalSources)
      return { status: 200, json: { success: true, delivery: current } }
    },
  })
  await page.goto("/admin/system")
  await expect(page.getByRole("button", { name: "保存分发配置" })).toBeEnabled()
  await page.getByRole("combobox", { name: "地图分发方式" }).click()
  await expect(
    page.getByRole("option", { name: "Mapbox 底图＋地区搜索", exact: true })
  ).toBeEnabled()
  await page.getByRole("option", { name: "统一地图源", exact: true }).click()
  await page.getByRole("button", { name: "保存分发配置" }).click()
  await expect(page.getByText("已切换为统一地图源")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "删除 国内高德" })
  ).toBeEnabled()
  await expect(
    page.getByRole("button", { name: "删除 海外 Mapbox" })
  ).toBeEnabled()
  await page.getByRole("button", { name: "编辑 国内高德" }).click()
  await expect(page.getByLabel("高德 JS API Key")).toHaveValue(
    "public-amap-key-1234567890"
  )
  await expect(page.getByLabel("高德安全代理地址")).toHaveValue("/_AMapService")
  await page.getByLabel("地图服务商").click()
  await page.getByRole("option", { name: "Mapbox", exact: true }).click()
  await expect(page.getByLabel("Mapbox 公开 Token")).toBeVisible()
  await expect(page.getByLabel("地图样式地址")).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    )
  ).toBe(false)
  const accessibility = await new AxeBuilder({ page })
    .setLegacyMode()
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  expect(accessibility.violations).toEqual([])
  await page.screenshot({
    path: testInfo.outputPath("map-source-editor.png"),
    fullPage: true,
  })
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByRole("combobox", { name: "地图分发方式" }).click()
  await page
    .getByRole("option", { name: "Mapbox 底图＋地区搜索", exact: true })
    .click()
  await page.getByRole("button", { name: "保存分发配置" }).click()
  await expect(page.getByText("Mapbox 底图＋地区搜索已生效")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "删除 国内高德" })
  ).toBeDisabled()
  await expect(
    page.getByRole("button", { name: "删除 海外 Mapbox" })
  ).toBeDisabled()
  await page.screenshot({
    path: testInfo.outputPath("regional-map-delivery.png"),
    fullPage: true,
  })
})
