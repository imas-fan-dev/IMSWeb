import type { CDPSession, Locator, Page } from "@playwright/test"

import { expect, test, type ApiDispatcher } from "./fixtures/test"
import { makeCharacterCatalog } from "./fixtures/fudaba-characters"

const APP_ACCESS_TOKEN = "app-namecard-manager-access-token"

function appCorsHeaders(documentOrigin: string) {
  return {
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-IMS-Auth-Mode, X-CSRFToken",
    "Access-Control-Allow-Methods": "DELETE, GET, HEAD, OPTIONS, POST, PUT",
    "Access-Control-Allow-Origin": documentOrigin,
  }
}

const session = {
  success: true,
  account: { id: "platform-app", status: "active" },
  profile: {
    uid: 1,
    displayName: "App 制作人",
    avatarUrl: null as string | null,
    homeCity: "上海",
    bio: "",
  },
}

/** 一张已发布的名片：published 才可勾选/可拖拽（R3）。 */
const card = {
  id: "card-1",
  cardNumber: 7,
  producerName: "App 制作人",
  seriesCodes: ["765"],
  favoriteCharacters: [{ id: 1, name: "天海春香", seriesCode: "765" }],
  frontImageUrl: "/brand/series/wall/765pro.webp",
  backImageUrl: "/brand/series/wall/cinderella-girls.webp",
  pages: [
    {
      pageId: "front",
      role: "front" as const,
      order: 1,
      url: "/brand/series/wall/765pro.webp",
      previewUrl: "/brand/series/wall/765pro.webp",
      thumbUrl: "/brand/series/wall/765pro.webp",
      width: 900,
      height: 500,
    },
    {
      pageId: "back",
      role: "back" as const,
      order: 2,
      url: "/brand/series/wall/cinderella-girls.webp",
      previewUrl: "/brand/series/wall/cinderella-girls.webp",
      thumbUrl: "/brand/series/wall/cinderella-girls.webp",
      width: 900,
      height: 500,
    },
  ],
  accent: "#f34e6c",
  bio: "上海地区制作人",
  tradeNote: "周末现场交换",
  exchangeMode: "auto",
  madeOn: null,
  groupName: null,
  isGroupCard: false,
  producerReading: null,
  isOriginal: false,
  madeWithAi: false,
  visible: true,
  credits: [],
  publicationStatus: "published",
  reviewStatus: null,
  reviewReason: null,
  reviewSubmittedAt: null,
  pendingContent: null,
  revision: 3,
  createdAt: "2026-08-02T08:00:00.000Z",
  updatedAt: "2026-08-02T09:00:00.000Z",
}

/**
 * 管理器打开时会要的那几份数据。布局用共享 fixture 的兜底（空分组 + 我们的卡，
 * 布局没出现过的卡按约定补进默认分组最前）。
 */
async function installManagerMocks(
  dispatcher: ApiDispatcher,
  corsHeaders: Record<string, string>
) {
  await dispatcher.mock(
    {
      method: "GET",
      path: "/api/platform/auth/session",
      times: { min: 1, max: 8 },
    },
    (route) => route.fulfill({ json: session, headers: corsHeaders })
  )
  await dispatcher.mock(
    { method: "GET", path: "/api/platform/me", times: { min: 1, max: 12 } },
    (route) =>
      route.fulfill({
        json: {
          ...session,
          capabilities: { fudabaWrite: true },
          profile: { ...session.profile, uid: 1, pageSlug: null, updatedAt: 1 },
        },
        headers: corsHeaders,
      })
  )
  await dispatcher.mock(
    {
      method: "GET",
      path: "/api/community/exchange/me/cards",
      times: { min: 1, max: 12 },
    },
    (route) => route.fulfill({ json: { items: [card] }, headers: corsHeaders })
  )
  for (const path of [
    "/api/community/exchange/me/series",
    "/api/community/exchange/me/offices",
  ]) {
    await dispatcher.mock(
      { method: "GET", path, times: { min: 0, max: 12 } },
      (route) => route.fulfill({ json: { items: [] }, headers: corsHeaders })
    )
  }
  await dispatcher.mock(
    {
      method: "GET",
      path: "/api/community/exchange/characters",
      times: { min: 0, max: 2 },
    },
    (route) => route.fulfill({ json: makeCharacterCatalog() })
  )
  await dispatcher.mock(
    { method: "GET", path: "/api/wiki/catalog", times: { min: 0, max: 12 } },
    (route) =>
      route.fulfill({
        json: {
          status: "success",
          agencies: [],
          searchEntries: [],
          selection: null,
        },
        headers: corsHeaders,
      })
  )
}

async function openManager(page: Page, dispatcher: ApiDispatcher, baseURL?: string) {
  if (!baseURL) throw new Error("App namecard manager E2E requires baseURL")
  const documentOrigin = new URL(baseURL).origin
  await installManagerMocks(dispatcher, appCorsHeaders(documentOrigin))
  await page.goto("/account/me/namecards", { waitUntil: "domcontentloaded" })

  const list = page.getByLabel("我的名片清单")
  const tile = list.locator('[data-testid="sortable-card-tile"]').first()
  await expect(tile).toBeVisible()
  return { list, tile }
}

/** 触点落在元素中心（元素先滚进视口——CDP 的触点坐标就是视口坐标）。 */
/**
 * 编辑模式下瓦片中心在无头 Chromium 里可能落在 `elementFromPoint` 的空白区
 * （真机正常，见 2026-11-19 iPhone 13 / vivo S50 实机回归）：触屏事件会以
 * `<html>` 为目标，dnd-kit 的 `TouchSensor` 收不到。逐点扫描找真实可命中的位置。
 */
async function hitTestablePointOf(target: Locator) {
  await target.scrollIntoViewIfNeeded()
  const point = await target.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    for (let dy = 6; dy < rect.height - 6; dy += 6) {
      for (const ratio of [0.5, 0.25, 0.75]) {
        const x = rect.left + rect.width * ratio
        const y = rect.top + dy
        if (el.contains(document.elementFromPoint(x, y))) return { x, y }
      }
    }
    return null
  })
  if (!point) throw new Error("tile has no hit-testable point")
  return point
}

async function touchPointOf(target: Locator) {
  await target.scrollIntoViewIfNeeded()
  const box = await target.boundingBox()
  if (!box) throw new Error("element has no box to touch")
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

function touchEvent(
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  point?: { x: number; y: number }
) {
  return cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: point ? [{ ...point, id: 1 }] : [],
  })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((accessToken) => {
    window.localStorage.setItem("imsweb.language", "zh-CN")
    window.localStorage.setItem("ims.platform.access-token", accessToken)
    document.cookie = "ims_platform_csrf=e2e; path=/"
  }, APP_ACCESS_TOKEN)
})

test("enters editing mode from a touch long press on a tile", async ({
  page,
  api: dispatcher,
  baseURL,
}) => {
  const { tile } = await openManager(page, dispatcher, baseURL)
  const point = await touchPointOf(tile)

  const cdp = await page.context().newCDPSession(page)
  try {
    await touchEvent(cdp, "touchStart", point)
    // 450ms 才算长按：不固定等待，等「长按已经生效」这个可观察结果（编辑模式按钮出现）。
    await expect(page.getByRole("button", { name: "退出编辑" })).toBeVisible()
    await touchEvent(cdp, "touchEnd")
  } finally {
    await cdp.detach()
  }

  // 长按进编辑模式，并默认勾选触发这次长按的那张瓦片（用户 2026-11-17 追加）。
  await expect(page.getByRole("button", { name: "退出编辑" })).toBeVisible()
  await expect(page.getByText("已选 1 张")).toBeVisible()
  await expect(
    page.getByRole("checkbox", { name: /App 制作人/ })
  ).toHaveAttribute("aria-checked", "true")
  // 一个会话只提示一次「长按拖动可调整顺序」。
  await expect(page.getByText("长按拖动可调整顺序")).toBeVisible()

  // 轻点一下这张瓦片（浏览器的补点被吞掉）不该把默认勾选取消。
  await expect(
    page.getByRole("checkbox", { name: /App 制作人/ })
  ).toHaveAttribute("aria-checked", "true")
})

// TODO(触屏拖拽): 实机（iPhone 13 iOS 18.4 / vivo S50 Pro mini Android 16）长按可拖、
// 页面不滚，产品行为成立；但无头 Chromium 320px 下整块瓦片不是 hit-testable
// (`elementFromPoint` 只返回 <html>`)，CDP 触屏事件到不了 `TouchSensor`。
// 需要换成不依赖命中测试的输入方式（或等 Playwright 修复）后再删掉 fixme。
test.fixme("drags a tile with a touch hold without scrolling the page", async ({
  page,
  api: dispatcher,
  baseURL,
}) => {
  const { tile } = await openManager(page, dispatcher, baseURL)

  // 这条冒烟钉的是「触屏拖拽」，编辑模式用工具栏按钮进去（长按那条路上面已覆盖）。
  await page.getByRole("button", { name: "编辑模式" }).click()
  await expect(page.getByRole("button", { name: "退出编辑" })).toBeVisible()

  const point = await hitTestablePointOf(tile)
  const scrollBefore = await page.evaluate(() => window.scrollY)
  const dragLayer = page.locator('[data-testid="card-drag-layer"]')

  const cdp = await page.context().newCDPSession(page)
  try {
    await touchEvent(cdp, "touchStart", point)
    // 250ms 之前不动手：这不是拖拽（否则触屏上轻轻一碰页面就乱）。
    await expect(dragLayer).toHaveCount(0)

    // 按住够久（`TouchSensor` 的 delay）才激活——不用移动。等「拖拽层出现」这个可观察结果，
    // 不写固定等待（e2e 源码策略禁止 `waitForTimeout`）。
    await expect(dragLayer).toBeVisible()

    // 手指移动：拖动跟着走，但页面**不滚**（`touch-action: none` 只加在瓦片上）。
    await touchEvent(cdp, "touchMove", { x: point.x, y: point.y + 160 })
    await expect(dragLayer).toBeVisible()
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)

    // 抬手：这一趟干净地结束。
    await touchEvent(cdp, "touchEnd")
    await expect(dragLayer).toHaveCount(0)
  } finally {
    await cdp.detach()
  }
})
