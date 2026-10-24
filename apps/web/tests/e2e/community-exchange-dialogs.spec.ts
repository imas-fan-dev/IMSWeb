import { expect, test, type ApiDispatcher } from "./fixtures/test"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"

const office = {
  id: "dialog-office",
  slug: "dialog-office",
  name: "上海交换事务所",
  intro: "制作人线下名片交换点。",
  city: "上海",
  address: "上海市徐汇区",
  accent: "#f34f6d",
  coverUrl: null,
  isOpen: true,
  visitorCount: 12,
  seriesCodes: ["765"],
}
const emptyPage = {
  items: [],
  pageInfo: { hasNextPage: false, nextCursor: null },
}

async function installDialogApis(api: ApiDispatcher) {
  await installEmptyWikiCatalogMock(api, { min: 0, max: 8 })
  await api.mockRoute(
    "/api/community/exchange/series",
    (route) => route.fulfill({ json: { items: [] } }),
    "GET",
    { min: 1, max: 4 }
  )
  await api.mockRoute(
    "**/api/community/exchange/offices?*",
    (route) =>
      route.fulfill({
        json: {
          ...emptyPage,
          items: [
            ...Array.from({ length: 11 }, (_, index) => ({
              ...office,
              id: `example-${index}`,
              slug: `example-${index}`,
              name: `示例交换点 ${index + 1}`,
            })),
            office,
          ],
        },
      }),
    "GET",
    { min: 1, max: 2 }
  )
  await api.mockRoute(
    "**/api/community/exchange/cards?*",
    (route) => route.fulfill({ json: emptyPage }),
    "GET",
    { min: 1, max: 2 }
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
    { min: 1, max: 2 }
  )
  await api.mockRoute(
    "**/api/community/exchange/map/offices?*",
    (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: office.id,
              slug: office.slug,
              name: office.name,
              city: office.city,
              address: office.address,
              accent: office.accent,
              isOpen: true,
              seriesCodes: office.seriesCodes,
              location: {
                latitude: 31.2,
                longitude: 121.5,
                precision: "regional",
              },
            },
          ],
          truncated: false,
        },
      }),
    "GET",
    { min: 1, max: 6 }
  )
  await api.mockRoute(
    "/api/community/exchange/offices/dialog-office",
    (route) => route.fulfill({ json: { office: { ...office, cards: [] } } }),
    "GET",
    { min: 1, max: 2 }
  )
}

test("keeps map state through office, directory and account dialogs with back and forward @mobile", async ({
  api,
  page,
  isMobile,
}, testInfo) => {
  await installDialogApis(api)
  await page.setViewportSize(
    isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }
  )
  let viewportReads = 0
  page.on("request", (request) => {
    if (
      request.method() === "GET" &&
      request.url().includes("/api/community/exchange/map/offices")
    )
      viewportReads++
  })
  await page.goto("/community/exchange?city=上海&series=765&open=true")
  await expect(page.locator("[data-map-results-state]")).toHaveAttribute(
    "data-map-results-state",
    "ready"
  )
  const input = page.getByRole("textbox", { name: "搜索地点" })
  await page.getByRole("button", { name: "展开地图面板" }).click()
  await page.getByRole("tab", { name: "地点", exact: true }).click()
  await input.fill("保留的搜索草稿")
  const retainedInput = await input.elementHandle()
  const canvas = page.locator("canvas.maplibregl-canvas")
  const retainedCanvas = await canvas.elementHandle()
  const frame = await canvas.boundingBox()
  const count = page.locator("[data-map-office-count]")
  const retainedCount = await count.elementHandle()
  const committedReads = viewportReads
  const more = page.getByRole("button", { name: "更多地图工具" })
  await more.click()
  await page.getByRole("menuitem", { name: "打开事务所名录" }).click()
  const directory = page.getByRole("dialog", { name: "公开交换名录" })
  await expect(directory).toBeVisible()
  const officeLink = directory.getByRole("link", {
    name: office.name,
    exact: true,
  })
  const retainedLink = await officeLink.elementHandle()
  await officeLink.scrollIntoViewIfNeeded()
  const directoryScroll = await officeLink.evaluateHandle((node) => {
    for (
      let parent = node.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      if (
        parent.scrollHeight > parent.clientHeight &&
        /auto|scroll/.test(getComputedStyle(parent).overflowY)
      )
        return parent
    }
    throw Error("Directory needs a scrollable content region")
  })
  const scrollTop = await directoryScroll.evaluate((node) => node.scrollTop)
  expect(scrollTop).toBeGreaterThan(0)
  await officeLink.click()
  await expect(page).toHaveURL(/\/community\/exchange\/offices\/dialog-office$/)
  const detail = page.getByRole("dialog", { name: "事务所详情" })
  await expect(
    detail.getByRole("heading", { name: office.name, exact: true })
  ).toBeVisible()
  await expect(
    detail.getByRole("heading", { name: "事务所名片墙" })
  ).toBeVisible()
  await expect(
    detail.getByText("名片墙还是空的", { exact: true })
  ).toBeVisible()
  await expect(page.locator("main#main-content")).toHaveCount(1)
  await expect(detail).toHaveCSS("opacity", "1")
  await page.screenshot({ path: testInfo.outputPath("office-dialog.png") })
  await page.keyboard.press("Escape")
  await expect(directory).toBeVisible()
  await expect(officeLink).toBeFocused()
  expect(
    await officeLink.evaluate((node, old) => node === old, retainedLink)
  ).toBe(true)
  expect(new URL(page.url()).searchParams.get("city")).toBe("上海")
  expect(await directoryScroll.evaluate((node) => node.scrollTop)).toBe(
    scrollTop
  )
  await page.goForward()
  await expect(
    detail.getByRole("heading", { name: office.name, exact: true })
  ).toBeVisible()
  await detail.getByRole("button", { name: "关闭", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(input).toHaveValue("保留的搜索草稿")
  await more.click()
  await page.getByRole("menuitem", { name: "我的交换账号" }).click()
  const account = page.getByRole("dialog", { name: "个人档案" })
  await expect(
    account.getByText("请先登录平台帐号", { exact: true })
  ).toBeVisible()
  await expect(
    account.getByRole("link", { name: "登录平台帐号", exact: true })
  ).toHaveAttribute("href", "/account/login")
  await account.getByRole("link", { name: "返回交换事务所" }).click()
  await expect(account).toHaveCount(0)
  expect(new URL(page.url()).searchParams.getAll("series")).toEqual(["765"])
  await expect(input).toHaveValue("保留的搜索草稿")
  expect(await input.evaluate((node, old) => node === old, retainedInput)).toBe(
    true
  )
  expect(
    await canvas.evaluate((node, old) => node === old, retainedCanvas)
  ).toBe(true)
  expect(await count.evaluate((node, old) => node === old, retainedCount)).toBe(
    true
  )
  expect(await canvas.boundingBox()).toEqual(frame)
  expect(viewportReads).toBe(committedReads)
})

test("opens direct office links over the map and safely closes after refresh @mobile", async ({
  api,
  page,
  isMobile,
}, testInfo) => {
  await installDialogApis(api)
  await page.setViewportSize(
    isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }
  )
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" })
  await page.goto("/community/exchange/offices/dialog-office?city=上海")
  const detail = page.getByRole("dialog", { name: "事务所详情" })
  await expect(
    detail.getByRole("heading", { name: office.name, exact: true })
  ).toBeVisible()
  await page.reload()
  await expect(
    detail.getByRole("heading", { name: office.name, exact: true })
  ).toBeVisible()
  await expect(page.locator("[data-map-results-state]")).toHaveAttribute(
    "data-map-results-state",
    "ready"
  )
  const canvas = page.locator("canvas.maplibregl-canvas")
  const retainedCanvas = await canvas.elementHandle()
  const box = await detail.boundingBox()
  const viewport = page.viewportSize()!
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
  await expect(detail).toHaveCSS("opacity", "1")
  await page.screenshot({ path: testInfo.outputPath("office-direct-dark.png") })
  await detail.getByRole("button", { name: "返回地图", exact: true }).click()
  await expect(page).toHaveURL(/\/community\/exchange\?city=/)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect(
    await canvas.evaluate((node, old) => node === old, retainedCanvas)
  ).toBe(true)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
})
