import { expect, test, type ApiDispatcher } from "./fixtures/test"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import type {
  FudabaOwnerCard,
  FudabaPlacedCard,
  FudabaOwnerOffice,
} from "@imsweb/contracts/fudaba"
import { makeCharacterCatalog } from "./fixtures/fudaba-characters"
import { settleToasts } from "./fixtures/toast"

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

async function installDialogApis(
  api: ApiDispatcher,
  cards: FudabaPlacedCard[] = [],
  publicName = () => office.name
) {
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
                precision: "exact",
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
    (route) =>
      route.fulfill({
        json: { office: { ...office, name: publicName(), cards } },
      }),
    "GET",
    { min: 1, max: 2 }
  )
}

test("keeps map state through office dialogs and opens personal pages separately @mobile", async ({
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
  await more.click()
  await page.getByRole("menuitem", { name: "我的交换账号" }).click()
  await expect(page).toHaveURL(/\/account\/me$/)
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(0)
  await expect(
    page.getByRole("main").getByText("未登录", { exact: true })
  ).toBeVisible()
  await expect(page.locator('a[href="/account/login"]')).toContainText("登录")
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

test("manages offices and cards in map dialogs and shows a temporary location bubble @mobile", async ({
  api,
  page,
  context,
  isMobile,
}, testInfo) => {
  await page.setViewportSize(
    isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }
  )
  await page.addInitScript(() => {
    localStorage.setItem("imsweb.language", "zh-CN")
    document.cookie = "ims_platform_csrf=map-management; path=/"
  })
  const ownedCard: FudabaOwnerCard = {
    id: "managed-card",
    producerName: "地图制作人",
    displayName: "地图管理名片",
    seriesCode: "765",
    favoriteCharacter: "天海春香",
    favoriteCharacters: [{ id: 1, name: "天海春香", seriesCode: "765" }],
    frontImageUrl: "/brand/series/wall/765pro.webp",
    backImageUrl: "/brand/series/wall/cinderella-girls.webp",
    accent: "#f34e6c",
    bio: "",
    tradeNote: "周末交换",
    available: true,
    publicationStatus: "published",
    reviewStatus: null,
    reviewReason: null,
    reviewSubmittedAt: null,
    pendingContent: null,
    revision: 1,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
  }
  const placedCard: FudabaPlacedCard = {
    id: ownedCard.id,
    producerName: ownedCard.producerName,
    displayName: ownedCard.displayName,
    seriesCode: ownedCard.seriesCode,
    favoriteCharacter: ownedCard.favoriteCharacter,
    favoriteCharacters: ownedCard.favoriteCharacters,
    frontImageUrl: ownedCard.frontImageUrl,
    backImageUrl: ownedCard.backImageUrl,
    accent: ownedCard.accent,
    bio: ownedCard.bio,
    tradeNote: ownedCard.tradeNote,
    available: ownedCard.available,
    createdAt: ownedCard.createdAt,
    source: null,
    viewerOwned: true,
    interactions: {
      likes: 0,
      favorites: 0,
      viewerLiked: false,
      viewerFavorited: false,
    },
    placement: {
      pinnedAt: ownedCard.createdAt,
      x: 50,
      y: 50,
      rotation: 0,
      zIndex: 1,
      revision: 1,
      updatedAt: ownedCard.updatedAt,
    },
  }
  const ownedOffice: FudabaOwnerOffice = {
    ...office,
    location: { latitude: 31.2, longitude: 121.5, precision: "exact" },
    pendingCoverUrl: null,
    pendingCoverSubmittedAt: null,
    status: "active",
    reviewState: "published",
    submittedAt: ownedCard.createdAt,
    reviewedAt: ownedCard.updatedAt,
    reviewedBy: 17,
    reviewNote: "",
    reviewInProgress: false,
    revision: 1,
    createdAt: ownedCard.createdAt,
    updatedAt: ownedCard.updatedAt,
    archivedAt: null,
  }
  const session = {
    success: true,
    account: { id: "map-owner", status: "active" },
    profile: {
      displayName: "地图制作人",
      avatarUrl: null,
      homeCity: "上海",
      bio: "",
    },
  }
  let publicOfficeName = office.name
  await installDialogApis(api, [placedCard], () => publicOfficeName)
  for (const [path, json, times] of [
    ["/api/platform/auth/session", session, 1],
    [
      "/api/platform/me",
      {
        ...session,
        capabilities: { fudabaWrite: true },
        profile: { ...session.profile, updatedAt: 1 },
      },
      3,
    ],
    ["/api/community/exchange/me/cards", { items: [ownedCard] }, 3],
    ["/api/community/exchange/me/series", { items: [] }, 2],
    ["/api/community/exchange/me/offices", { items: [ownedOffice] }, 2],
    // One explicit management opening loads owner detail; PUT returns the saved office.
    [
      `/api/community/exchange/me/offices/${office.id}`,
      { office: ownedOffice },
      1,
    ],
    ["/api/community/exchange/me/claim-envelopes", { items: [] }, 2],
    ["/api/community/exchange/me/favorites", { ...emptyPage }, 2],
    [
      "/api/community/exchange/characters",
      makeCharacterCatalog(),
      { min: 1, max: 2 },
    ],
  ] as const) {
    await api.mock({ method: "GET", path, times }, (route) =>
      route.fulfill({ json })
    )
  }
  await api.mock(
    {
      method: "PUT",
      path: `/api/community/exchange/me/offices/${office.id}`,
      times: 1,
    },
    async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({
        name: "地图中更新的事务所",
        expectedRevision: 1,
      })
      publicOfficeName = "地图中更新的事务所"
      await route.fulfill({
        json: {
          success: true,
          office: { ...ownedOffice, name: "地图中更新的事务所", revision: 2 },
        },
      })
    }
  )
  for (const method of ["PUT", "DELETE"] as const) {
    await api.mock(
      {
        method,
        path: `/api/community/exchange/cards/${ownedCard.id}/favorite`,
        times: 1,
      },
      (route) =>
        route.fulfill({
          json: {
            success: true,
            cardId: ownedCard.id,
            interactions: {
              likes: 0,
              favorites: method === "PUT" ? 1 : 0,
              viewerLiked: false,
              viewerFavorited: method === "PUT",
            },
          },
        })
    )
  }
  await api.mock(
    {
      method: "GET",
      path: `/api/community/exchange/cards/${ownedCard.id}/reactions`,
      times: 1,
    },
    (route) =>
      route.fulfill({
        json: { success: true, cardId: ownedCard.id, reactions: [] },
      })
  )
  let mapBoundsReads = 0
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/community/exchange/map/offices"
    )
      mapBoundsReads++
  })
  await page.goto(`/community/exchange/offices/${office.slug}`)
  const detail = page.getByRole("dialog", { name: "事务所详情", exact: true })
  await expect(
    detail.getByRole("heading", { name: office.name, exact: true })
  ).toBeVisible()
  const canvas = page.locator("canvas.maplibregl-canvas")
  const retainedCanvas = await canvas.elementHandle()
  await detail.getByRole("button", { name: "管理我的事务所" }).click()
  const management = page.getByRole("dialog", {
    name: "管理我的事务所",
    exact: true,
  })
  await expect(page.locator("[data-map-results-state]")).toHaveAttribute(
    "data-map-results-state",
    "ready"
  )
  const mainFrame = await canvas.boundingBox()
  const readsBeforePicker = mapBoundsReads
  const addressBeforePicker = await management
    .getByRole("textbox", { name: "详细地址" })
    .inputValue()
  await management.getByRole("button", { name: "搜索地点与地图选点" }).click()
  await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(2)
  await expect(management.locator("[data-map-state=ready]")).toBeVisible()
  expect(
    await canvas.first().evaluate((node, old) => node === old, retainedCanvas)
  ).toBe(true)
  await management
    .getByRole("button", { name: "取消选点", exact: true })
    .click()
  await expect(canvas).toHaveCount(1)
  expect(
    await canvas.evaluate((node, old) => node === old, retainedCanvas)
  ).toBe(true)
  expect(await canvas.boundingBox()).toEqual(mainFrame)
  expect(mapBoundsReads).toBe(readsBeforePicker)
  await expect(
    management.getByRole("textbox", { name: "详细地址" })
  ).toHaveValue(addressBeforePicker)
  await management
    .getByRole("textbox", { name: "事务所名称" })
    .fill("地图中更新的事务所")
  await management
    .getByRole("button", { name: "保存事务所", exact: true })
    .click()
  await expect(
    management.getByText("事务所资料未发生变化，保持已公开。", {
      exact: true,
    })
  ).toBeVisible()
  await expect(
    management.getByRole("link", { name: "打开完整管理页面" })
  ).toHaveAttribute("href", `/account/me/offices?office=${office.id}`)
  await page.screenshot({
    path: testInfo.outputPath("map-office-management.png"),
  })
  await settleToasts(page)
  await page.keyboard.press("Escape")
  await expect(management).toHaveCount(0)
  await expect(detail).toBeVisible()
  await expect(
    detail.getByRole("heading", { name: "地图中更新的事务所", exact: true })
  ).toBeVisible()
  await detail
    .getByRole("button", {
      name: `查看${ownedCard.displayName}正面`,
      exact: true,
    })
    .click()
  const preview = page.getByRole("dialog", {
    name: `${ownedCard.displayName}正面`,
    exact: true,
  })
  await preview.getByRole("button", { name: "收藏（0）", exact: true }).click()
  await expect(
    preview.getByRole("button", { name: "取消收藏（1）", exact: true })
  ).toBeEnabled()
  await page.keyboard.press("Escape")
  await expect(preview).toHaveCount(0)
  await detail.getByRole("tab", { name: "列表", exact: true }).click()
  await detail
    .getByRole("button", { name: "取消收藏（1）", exact: true })
    .click()
  await detail
    .getByRole("button", {
      name: `查看${ownedCard.displayName}正面`,
      exact: true,
    })
    .click()
  await expect(
    preview.getByRole("button", { name: "收藏（0）", exact: true })
  ).toBeEnabled()
  await preview.getByRole("button", { name: "管理我的名片" }).click()
  const cardManagement = page.getByRole("dialog", {
    name: "管理我的名片",
    exact: true,
  })
  await expect(
    cardManagement.getByRole("textbox", { name: "名片标题" })
  ).toHaveValue(ownedCard.displayName)
  const title = cardManagement.getByRole("textbox", { name: "名片标题" })
  await title.fill("")
  await title.pressSequentially("P-01+=")
  await expect(title).toHaveValue("P-01+=")
  await expect(
    cardManagement.getByRole("button", { name: "保存名片资料" })
  ).toBeEnabled()
  await page.screenshot({
    path: testInfo.outputPath("map-card-management.png"),
  })
  await page.keyboard.press("Escape")
  await expect(cardManagement).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(preview).toHaveCount(0)
  await detail.getByRole("button", { name: "返回地图", exact: true }).click()
  expect(
    await canvas.evaluate((node, old) => node === old, retainedCanvas)
  ).toBe(true)
  await context.grantPermissions(["geolocation"])
  await context.setGeolocation({ latitude: 31.2, longitude: 121.5 })
  await page.getByRole("button", { name: "回到我的位置" }).click()
  await page.mouse.move(0, 0)
  const bubble = page.getByText("已回到您的位置", { exact: true })
  await expect(bubble).toBeVisible()
  expect(
    await bubble.evaluate((node) =>
      Boolean(node.closest('[role="img"][aria-label="您的当前位置"]'))
    )
  ).toBe(true)
  const locationMarker = page.getByRole("img", { name: "您的当前位置" })
  await expect
    .poll(async () => {
      const [mapBox, markerBox] = await Promise.all([
        canvas.boundingBox(),
        locationMarker.boundingBox(),
      ])
      if (!mapBox || !markerBox) return false
      return (
        Math.abs(
          markerBox.x + markerBox.width / 2 - mapBox.x - mapBox.width / 2
        ) < 2 &&
        Math.abs(
          markerBox.y + markerBox.height / 2 - mapBox.y - mapBox.height / 2
        ) < 2
      )
    })
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath("user-location-bubble.png"),
  })
  await expect(bubble).toHaveCount(0)
  await expect(page.getByRole("img", { name: "您的当前位置" })).toBeVisible()
})
