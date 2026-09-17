import { homepageLinksSchema } from "@imsweb/contracts/homepage-links"
import { expect, test, type ApiDispatcher } from "./fixtures/test"
import type { Page } from "@playwright/test"

import {
  applyNamecardSafeArea,
  mockNamecardBrowsing,
} from "./fixtures/namecard-browsing"
import { installEmptyWikiCatalogMock } from "./fixtures/homepage"
import { installSeededPublicApis } from "./fixtures/public-content"

const cardsUrl = "/community/cards?page=2&size=12"
const nav = (page: Page) => page.getByRole("navigation", { name: "主导航" })

function resourcesDirectory(api: ApiDispatcher) {
  api.expect({
    method: "GET",
    path: "/api/homepage-links",
    responses: { 200: homepageLinksSchema },
    times: 1,
    handle: () => ({
      status: 200,
      json: {
        sections: {
          navigation: Array.from({ length: 24 }, (_, index) => ({
            id: `extra-${index}`,
            section: "navigation",
            title: `扩展资料 ${index + 1}`,
            description: "测试目录滚动与扩展入口保留",
            href: `https://example.com/resource/${index}`,
            icon: "external-link",
            accent: "info",
            displayOrder: index,
          })),
          friend: [],
          support: [],
        },
      },
    }),
  })
}

async function readCards(page: Page) {
  await expect(
    page.getByRole("button", { name: "查看制作人名片 13 正面" })
  ).toBeVisible()
  await applyNamecardSafeArea(page)
  await page
    .getByRole("button", { name: "查看制作人名片 22 正面" })
    .scrollIntoViewIfNeeded()
  const top = await page.evaluate(() => window.scrollY)
  expect(top).toBeGreaterThan(300)
  return top
}

async function expectAccountPage(page: Page) {
  await expect(page).toHaveURL(/\/account\/me$/)
  await expect(
    page.getByRole("heading", { name: "我的", exact: true, level: 1 })
  ).toBeVisible()
}

async function frame(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("imsweb.language", "zh-CN")
  )
  await page.emulateMedia({ reducedMotion: "reduce" })
})

test(
  "resumes paginated reading after delayed data and returns to the community root",
  {
    tag: "@app-webkit",
  },
  async ({ page, api }, testInfo) => {
    const fixture = await mockNamecardBrowsing(page, api, 36, undefined, {
      cards: 2,
      reactionReads: 24,
      reactionWrites: 0,
    })
    installSeededPublicApis(api, [
      { path: "/api/community/exchange/series", times: 1 },
    ])
    await page.goto(cardsUrl)
    const top = await readCards(page)
    await nav(page).getByRole("link", { name: "我的", exact: true }).click()
    await expectAccountPage(page)
    fixture.hold(2)
    await nav(page).getByRole("link", { name: "社区", exact: true }).click()
    await expect(page).toHaveURL(new RegExp(cardsUrl.replace("?", "\\?")))
    await expect.poll(() => fixture.requests.length).toBe(2)
    await frame(page)
    fixture.release()
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(top, 0)
    await expect(
      nav(page).getByRole("link", { name: "社区", exact: true })
    ).toHaveAttribute("aria-current", "page")
    await page.screenshot({
      path: testInfo.outputPath("restored-card-reading.png"),
    })
    await page.getByRole("button", { name: "返回", exact: true }).click()
    // The wall's logical parent is the community root, not the My tab the user
    // happened to visit in between.
    await expect(page).toHaveURL(/\/community$/)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    for (const href of [
      "/events",
      "/community/cards",
      "/community/exchange",
      "/producer-map",
    ]) {
      await expect(page.locator(`main a[href="${href}"]`)).toBeVisible()
    }
    await expect(
      page.getByRole("button", { name: "返回", exact: true })
    ).toHaveCount(0)
  }
)

test("keeps the reading position when reaction rows arrive after initial restoration", async ({
  page,
  api,
}) => {
  await page.clock.install()
  const counts = { "👍": 2, "🎮": 4, "🌹": 3, "🍔": 5, "🍭": 6, "🔨": 7 }
  const fixture = await mockNamecardBrowsing(
    page,
    api,
    36,
    { 13: counts },
    {
      cards: 2,
      reactionReads: 24,
      reactionWrites: 0,
    }
  )
  await page.goto(cardsUrl)
  const firstCard = page.locator("[data-namecard-item]").filter({
    has: page.getByRole("button", { name: "查看制作人名片 13 正面" }),
  })
  const reactions = firstCard.getByRole("button", { name: /次反应$/ })
  await expect(reactions).toHaveCount(6)
  const top = await readCards(page)
  const sourceHeight = await page.evaluate(
    () => document.documentElement.scrollHeight
  )
  await nav(page).getByRole("link", { name: "我的", exact: true }).click()
  await expectAccountPage(page)
  const release = fixture.holdReactions(13)
  try {
    await nav(page).getByRole("link", { name: "社区", exact: true }).click()
    await expect(reactions).toHaveCount(0)
    await page.clock.runFor(16)
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(top, 0)
    // Exercise growth beyond the former two-second restoration deadline.
    await page.clock.runFor(2300)
    release()
    await expect(reactions).toHaveCount(6)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
      .toBe(sourceHeight)
    await page.clock.runFor(32)
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(top, 0)
  } finally {
    release()
  }
})

test("resumes resource details and reselects a root without adding history", async ({
  page,
  api,
}, testInfo) => {
  installEmptyWikiCatalogMock(api)
  resourcesDirectory(api)
  await page.goto("/works/765?edition=2#intro")
  await expect(nav(page).getByRole("link")).toHaveText([
    "首页",
    "社区",
    "交换地图",
    "资料",
    "我的",
  ])
  // Keep both clicks in one turn so the first route cannot commit between them.
  await nav(page).evaluate((element) => {
    for (const href of ["/account/me", "/apps"]) {
      const link = element.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)
      if (!link) throw new Error(`Missing App tab: ${href}`)
      link.click()
    }
  })
  await frame(page)
  await expect(page).toHaveURL(/\/works\/765\?edition=2#intro$/)
  await nav(page).getByRole("link", { name: "资料", exact: true }).click()
  await expect(page).toHaveURL(/\/apps$/)
  await expect(page.locator('main a[href="/wiki"]')).toBeVisible()
  await expect(page.locator('main a[href="/story"]')).toHaveCount(0)
  await expect(page.getByText("扩展资料 24", { exact: true })).toBeAttached()
  await page.evaluate(() => window.scrollTo({ top: 500, behavior: "instant" }))
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(300)
  const length = await page.evaluate(() => history.length)
  await nav(page).getByRole("link", { name: "资料", exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  expect(await page.evaluate(() => history.length)).toBe(length)
  await page.screenshot({ path: testInfo.outputPath("resource-directory.png") })
})

test("replaces direct-entry back fallback and preserves the selected owner", async ({
  page,
  api,
}) => {
  await mockNamecardBrowsing(page, api, 36, undefined, {
    cards: 1,
    reactionReads: 12,
    reactionWrites: 0,
  })
  installSeededPublicApis(api, [
    { path: "/api/community/exchange/series", times: 1 },
  ])
  await page.goto(cardsUrl)
  await readCards(page)
  const length = await page.evaluate(() => history.length)
  await page.getByRole("button", { name: "返回", exact: true }).click()
  await expect(page).toHaveURL(/\/community$/)
  expect(await page.evaluate(() => history.length)).toBe(length)
  await expect(
    nav(page).getByRole("link", { name: "社区", exact: true })
  ).toHaveAttribute("aria-current", "page")
})

test("a newer section switch cancels a delayed restoration", async ({
  page,
  api,
}) => {
  const fixture = await mockNamecardBrowsing(page, api, 36, undefined, {
    cards: 2,
    reactionReads: 12,
    reactionWrites: 0,
  })
  resourcesDirectory(api)
  await page.goto(cardsUrl)
  await readCards(page)
  await nav(page).getByRole("link", { name: "我的", exact: true }).click()
  await expectAccountPage(page)
  fixture.hold(2)
  await nav(page).getByRole("link", { name: "社区", exact: true }).click()
  await expect.poll(() => fixture.requests.length).toBe(2)
  await nav(page).getByRole("link", { name: "资料", exact: true }).click()
  await expect(page).toHaveURL(/\/apps$/)
  await expect(page.getByText("扩展资料 24", { exact: true })).toBeAttached()
  fixture.release()
  await frame(page)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  await page.evaluate(() => window.scrollTo({ top: 420, behavior: "instant" }))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(420)
})

test("user scrolling cancels delayed restoration", async ({ page, api }) => {
  const fixture = await mockNamecardBrowsing(page, api, 36, undefined, {
    cards: 2,
    reactionReads: 24,
    reactionWrites: 0,
  })
  await page.goto(cardsUrl)
  await readCards(page)
  await nav(page).getByRole("link", { name: "我的", exact: true }).click()
  await expectAccountPage(page)
  fixture.hold(2)
  await nav(page).getByRole("link", { name: "社区", exact: true }).click()
  await expect.poll(() => fixture.requests.length).toBe(2)
  await frame(page)
  await page.keyboard.press("Home")
  await frame(page)
  fixture.release()
  await expect(
    page.getByRole("button", { name: "查看制作人名片 13 正面" })
  ).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
})

for (const outcome of ["shortened", "error"] as const) {
  test(`bounds restoration after ${outcome} content`, async ({ page, api }) => {
    const fixture = await mockNamecardBrowsing(page, api, 36, undefined, {
      cards: 2,
      reactionReads: outcome === "shortened" ? 13 : 12,
      reactionWrites: 0,
    })
    await page.goto(cardsUrl)
    const top = await readCards(page)
    await nav(page).getByRole("link", { name: "我的", exact: true }).click()
    await expectAccountPage(page)
    if (outcome === "shortened") fixture.setTotal(13)
    else fixture.failOnce(2)
    await nav(page).getByRole("link", { name: "社区", exact: true }).click()
    await expect.poll(() => fixture.requests.length).toBe(2)
    await expect(page.locator("[data-namecard-item]")).toHaveCount(
      outcome === "shortened" ? 1 : 0
    )
    await expect
      .poll(() =>
        page.evaluate(
          (requested) =>
            Math.abs(
              window.scrollY -
                Math.min(
                  requested,
                  Math.max(
                    0,
                    document.documentElement.scrollHeight - innerHeight
                  )
                )
            ),
          top
        )
      )
      .toBeLessThanOrEqual(1)
    await expect(
      nav(page).getByRole("link", { name: "社区", exact: true })
    ).toBeVisible()
  })
}

const ACCOUNT_SESSION = {
  success: true,
  account: { id: "platform-app", status: "active" },
  profile: {
    displayName: "App 制作人",
    avatarUrl: null as string | null,
    homeCity: "上海",
    bio: "",
  },
}

function installAppResourcesMocks(api: ApiDispatcher) {
  api.expect({
    method: "GET",
    path: "/api/homepage-links",
    responses: { 200: homepageLinksSchema },
    times: { min: 1, max: 4 },
    handle: () => ({
      status: 200,
      json: {
        sections: {
          navigation: Array.from({ length: 24 }, (_, index) => ({
            id: `extra-${index}`,
            section: "navigation",
            title: `扩展资料 ${index + 1}`,
            description: "测试目录滚动与扩展入口保留",
            href: `https://example.com/resource/${index}`,
            icon: "external-link",
            accent: "info",
            displayOrder: index,
          })),
          friend: [],
          support: [],
        },
      },
    }),
  })
  installEmptyWikiCatalogMock(api, { min: 1, max: 8 })
}

/**
 * Enough of the authenticated 我的 workspace for the back-navigation paths:
 * the session, the profile the workspace reads, and the two card endpoints the
 * cards section loads. The section only needs to mount, not render data.
 */
function installAccountMocks(api: ApiDispatcher) {
  api.mock(
    {
      method: "GET",
      path: "/api/platform/auth/session",
      times: { min: 1, max: 4 },
    },
    (route) =>
      route.fulfill({
        json: { ...ACCOUNT_SESSION, profile: { ...ACCOUNT_SESSION.profile } },
      })
  )
  api.mock(
    { method: "GET", path: "/api/platform/me", times: { min: 1, max: 4 } },
    (route) =>
      route.fulfill({
        json: {
          ...ACCOUNT_SESSION,
          capabilities: { fudabaWrite: true },
          profile: { ...ACCOUNT_SESSION.profile, updatedAt: 1 },
        },
      })
  )
  for (const path of [
    "/api/community/exchange/me/series",
    "/api/community/exchange/me/cards",
    "/api/community/exchange/me/claim-envelopes",
    "/api/community/exchange/me/offices",
  ]) {
    api.mock({ method: "GET", path, times: { min: 0, max: 4 } }, (route) =>
      route.fulfill({ json: { items: [] } })
    )
  }
  api.mock(
    {
      method: "GET",
      path: "/api/community/exchange/me/favorites",
      times: { min: 0, max: 4 },
    },
    (route) =>
      route.fulfill({
        json: {
          items: [],
          pageInfo: { hasNextPage: false, nextCursor: null },
        },
      })
  )
}

async function setAccountSessionHint(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("ims.platform.access-token", "app-nav-token")
    document.cookie = "ims_platform_csrf=e2e; path=/"
  })
}

test(
  "keeps the app viewport free of pinch and double-tap zoom",
  { tag: "@app-webkit" },
  async ({ page }) => {
    await page.goto("/account/me")
    const viewport = page.locator('meta[name="viewport"]')
    await expect(viewport).toHaveAttribute("content", /maximum-scale=1/)
    await expect(viewport).toHaveAttribute("content", /user-scalable=no/)
    await expect(viewport).toHaveAttribute("content", /viewport-fit=cover/)
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.documentElement).touchAction
        )
      )
      .toBe("pan-x pan-y")
  }
)

test(
  "returns to the account root from a directly entered section",
  { tag: "@app-webkit" },
  async ({ page, api }) => {
    installEmptyWikiCatalogMock(api, { min: 0, max: 4 })
    await page.goto("/account/me/cards")
    await expect(page).toHaveURL(/\/account\/me\/cards$/)
    await page.getByRole("button", { name: "返回", exact: true }).click()
    await expect(page).toHaveURL(/\/account\/me$/)
  }
)

test(
  "returns to the account root after entering a section from another tab",
  { tag: "@app-webkit" },
  async ({ page, api }) => {
    await setAccountSessionHint(page)
    installAppResourcesMocks(api)
    installAccountMocks(api)
    await page.goto("/apps")
    await nav(page).getByRole("link", { name: "我的", exact: true }).click()
    await expect(page).toHaveURL(/\/account\/me$/)
    await page.locator('a[href="/account/me/cards"]').click()
    await expect(page).toHaveURL(/\/account\/me\/cards$/)
    await page.getByRole("button", { name: "返回", exact: true }).click()
    await expect(page).toHaveURL(/\/account\/me$/)
  }
)

test(
  "returns a cross-tab account section to the account root",
  { tag: "@app-webkit" },
  async ({ page, api }) => {
    await setAccountSessionHint(page)
    installEmptyWikiCatalogMock(api, { min: 0, max: 4 })
    installAccountMocks(api)
    // Start on a resources detail page so the section is reached from another
    // tab and no account parent ever sits below it in session history.
    await page.goto("/works/765")
    await expect(page).toHaveURL(/\/works\/765$/)
    await nav(page).getByRole("link", { name: "我的", exact: true }).click()
    await expect(page).toHaveURL(/\/account\/me$/)
    await page.locator('a[href="/account/me/cards"]').click()
    await expect(page).toHaveURL(/\/account\/me\/cards$/)
    await page.getByRole("button", { name: "返回", exact: true }).click()
    // The page tree decides the destination, not the visit order that reached
    // the section from the resources tab.
    await expect(page).toHaveURL(/\/account\/me$/)
  }
)

test(
  "keeps the platform back gesture on the account root",
  { tag: "@app-webkit" },
  async ({ page, api }) => {
    installAppResourcesMocks(api)
    await page.goto("/apps")
    await nav(page).getByRole("link", { name: "我的", exact: true }).click()
    await expect(page).toHaveURL(/\/account\/me$/)
    // A tab root ends the page tree, so the header renders no back control.
    await expect(
      page.getByRole("button", { name: "返回", exact: true })
    ).toHaveCount(0)
    // The browser/native POP is not corrected on a root, so it still replays
    // session history to the previous tab.
    await page.goBack()
    await expect(page).toHaveURL(/\/apps$/)
  }
)

test(
  "returns a restored account section to its root on a native pop",
  { tag: "@app-webkit" },
  async ({ page, api }) => {
    await setAccountSessionHint(page)
    installAppResourcesMocks(api)
    installAccountMocks(api)
    await page.goto("/account/me")
    await page.locator('a[href="/account/me/cards"]').click()
    await expect(page).toHaveURL(/\/account\/me\/cards$/)
    // Leave the tab, then restore it, so /account/me no longer sits below the
    // section in session history and a native pop would land on 资料.
    await nav(page).getByRole("link", { name: "资料", exact: true }).click()
    await expect(page).toHaveURL(/\/apps$/)
    await nav(page).getByRole("link", { name: "我的", exact: true }).click()
    await expect(page).toHaveURL(/\/account\/me\/cards$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/account\/me$/)
    // The correction is a push, so the next native pop still reaches the tab
    // below instead of bouncing back to the section.
    await page.goBack()
    await expect(page).toHaveURL(/\/apps$/)
  }
)
